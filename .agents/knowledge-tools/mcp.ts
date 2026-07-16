/**
 * mcp.ts - a zero-dependency MCP server exposing the OKF knowledge bundle.
 * Newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio transport).
 *
 * Tools:
 *   okf_list_concepts { type? }            -> id/type/title/description for each concept
 *   okf_get_concept   { id }               -> the concept file, verbatim
 *   okf_search        { query, limit? }    -> ranked matches with a snippet
 */
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './config.ts';
import { loadConcepts, normalizeId, type Concept } from './lib.ts';

type Rpc = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

const TOOLS = [
  {
    name: 'okf_list_concepts',
    description:
      'List all concepts in the IGNIS knowledge bundle (id, type, title, description). Optionally filter by type (e.g. Package, Architecture, Convention, Playbook).',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', description: 'Filter by concept type' } },
    },
  },
  {
    name: 'okf_get_concept',
    description: 'Get the full markdown of one concept by id (e.g. "/packages/core" or "packages/core").',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Concept id (bundle-relative path, no extension)' } },
      required: ['id'],
    },
  },
  {
    name: 'okf_search',
    description: 'Full-text search over concept titles, descriptions, tags, and bodies. Returns ranked matches with a snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
];

const textContent = (opts: { value: string }) => {
  return { content: [{ type: 'text', text: opts.value }] };
};

const listConcepts = (opts: { concepts: Concept[]; type?: unknown }) => {
  const { concepts, type } = opts;

  const wanted = typeof type === 'string' ? type.toLowerCase() : '';

  const list = concepts
    .filter((concept) => !concept.reserved && (!wanted || concept.type.toLowerCase() === wanted))
    .map((concept) => ({
      id: concept.id,
      type: concept.type,
      title: concept.title,
      description: concept.description,
    }));

  return textContent({ value: JSON.stringify(list, null, 2) });
};

const getConcept = (opts: { concepts: Concept[]; id: unknown }) => {
  const { concepts } = opts;

  const id = normalizeId({ raw: String(opts.id ?? '') });
  const concept = concepts.find((entry) => entry.id === id);

  if (!concept) {
    return textContent({ value: `No concept with id "${id}". Use okf_list_concepts to see valid ids.` });
  }

  // Return the file verbatim. Reconstructing frontmatter from parsed fields silently
  // dropped every key the loader does not model (resource, timestamp, custom keys).
  return textContent({ value: concept.raw });
};

const searchConcepts = (opts: { concepts: Concept[]; query: unknown; limit: unknown }) => {
  const { concepts } = opts;

  const terms = String(opts.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const requested = Number(opts.limit);
  const limit = Number.isFinite(requested) && requested > 0 ? requested : 10;

  const scored = concepts
    .filter((concept) => !concept.reserved)
    .map((concept) => {
      const title = concept.title.toLowerCase();
      const tags = concept.tags.join(' ').toLowerCase();
      const description = concept.description.toLowerCase();
      const haystack = `${title} ${description} ${tags} ${concept.body.toLowerCase()}`;

      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) {
          score += 5;
        }
        if (tags.includes(term)) {
          score += 3;
        }
        if (description.includes(term)) {
          score += 3;
        }
        if (haystack.includes(term)) {
          score += 1;
        }
      }

      return { concept, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ concept }) => ({
      id: concept.id,
      type: concept.type,
      title: concept.title,
      snippet: concept.description || concept.body.slice(0, 140),
    }));

  return textContent({ value: scored.length ? JSON.stringify(scored, null, 2) : 'No matches.' });
};

const callTool = (opts: { name: string; args: Record<string, unknown>; concepts: Concept[] }) => {
  const { name, args, concepts } = opts;

  switch (name) {
    case 'okf_list_concepts': {
      return listConcepts({ concepts, type: args.type });
    }

    case 'okf_get_concept': {
      return getConcept({ concepts, id: args.id });
    }

    case 'okf_search': {
      return searchConcepts({ concepts, query: args.query, limit: args.limit });
    }

    default: {
      throw new Error(`unknown tool: ${name}`);
    }
  }
};

const handle = (opts: { msg: Rpc; concepts: Concept[] }): Rpc | null => {
  const { msg, concepts } = opts;

  const reply = (result: unknown): Rpc => ({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize': {
      return reply({
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      });
    }

    case 'tools/list': {
      return reply({ tools: TOOLS });
    }

    case 'tools/call': {
      try {
        return reply(
          callTool({
            name: String(msg.params?.name ?? ''),
            args: (msg.params?.arguments as Record<string, unknown>) ?? {},
            concepts,
          }),
        );
      } catch (error) {
        return { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: (error as Error).message } };
      }
    }

    case 'ping': {
      return reply({});
    }

    default: {
      // Notifications (no id) get no reply; unknown requests get method-not-found.
      if (msg.id === undefined) {
        return null;
      }

      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } };
    }
  }
};

export const runMcp = async (): Promise<void> => {
  // Concepts are loaded fresh at startup; the bundle is small and read-only per session.
  const concepts = loadConcepts();
  const send = (opts: { message: Rpc }): void => {
    process.stdout.write(JSON.stringify(opts.message) + '\n');
  };

  let buffer = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    buffer += chunk;

    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');

      if (!line) {
        continue;
      }

      let msg: Rpc;
      try {
        msg = JSON.parse(line) as Rpc;
      } catch (error) {
        console.error(`mcp: dropped malformed JSON-RPC line - ${(error as Error).message}`);
        continue;
      }

      const response = handle({ msg, concepts });
      if (response) {
        send({ message: response });
      }
    }
  }
};
