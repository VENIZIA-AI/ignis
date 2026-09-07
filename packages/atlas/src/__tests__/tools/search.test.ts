import { Corpora } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import type { IDocument } from '@/corpus';
import { Transport } from '@/protocol';
import { ChunkStore } from '@/search/store';
import { SymbolStore } from '@/symbols';
import { buildSearchTool } from '@/tools/search.tool';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const FIXTURES_ROOT = join(__dirname, '../fixtures/corpus');

const buildFixtureStore = (): ChunkStore => {
  const documents = CorpusLoader.getInstance().load({
    roots: [
      { corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki'), exclude: ['excluded'] },
      { corpus: Corpora.CHANGELOG, directory: join(FIXTURES_ROOT, 'changelogs') },
      { corpus: Corpora.KNOWLEDGE, directory: join(FIXTURES_ROOT, 'knowledge') },
    ],
  });

  const chunker = Chunker.getInstance();
  const store = new ChunkStore();
  store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });
  return store;
};

const callSearch = async (opts: {
  store: ChunkStore;
  args: Record<string, unknown>;
}): Promise<{
  error?: { code: number; message: string };
  result?: { content: { type: string; text: string }[] };
}> => {
  const transport = new Transport({
    tools: [buildSearchTool({ store: opts.store })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });
  const reply = await transport.handleLine({
    line: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'search', arguments: opts.args },
    }),
  });
  return JSON.parse(reply ?? 'null');
};

describe('search tool', () => {
  const store = buildFixtureStore();

  test('a missing query is -32602 with a message naming the field', async () => {
    const reply = await callSearch({ store, args: {} });
    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toContain('query');
  });

  test('a valid search returns { total, hits } under the 2,000-character budget with the default limit', async () => {
    const reply = await callSearch({ store, args: { query: 'artifacts' } });
    const text = reply.result?.content[0]?.text ?? '';
    const result = JSON.parse(text);

    expect(typeof result.total).toBe('number');
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  test('an omitted limit behaves exactly like limit: 10', async () => {
    const withDefault = await callSearch({ store, args: { query: 'artifacts' } });
    const withExplicitTen = await callSearch({ store, args: { query: 'artifacts', limit: 10 } });

    expect(withDefault.result?.content[0]?.text).toBe(withExplicitTen.result?.content[0]?.text);
  });
});

describe('search tool: response budget and paging (I1)', () => {
  const TERM = 'zephyrqueryterm';
  const DOCUMENT_COUNT = 14;

  // One document per hit (never two sections in the same document) - the per-document diversify
  // cap would otherwise drop matches before the budget even gets a chance to bite.
  const documents: IDocument[] = Array.from({ length: DOCUMENT_COUNT }, (_, index) => ({
    corpus: Corpora.WIKI,
    path: `guides/budget-fixture-${index}.md`,
    title: `Budget fixture document number ${index} about ${TERM}`,
    frontmatter: {},
    body: [
      `## Section about ${TERM} in document ${index}`,
      '',
      `This section repeats the term ${TERM} a few times across a longer paragraph of prose so the ` +
        `excerpt has real surrounding context, padded well past the two-hundred character tiny-merge ` +
        `threshold on its own for fixture document number ${index} here, comfortably.`,
    ].join('\n'),
  }));

  const buildBudgetStore = (): ChunkStore => {
    const chunker = Chunker.getInstance();
    const store = new ChunkStore();
    store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });
    return store;
  };

  test('the budget trims below limit on the first page, and nextOffset never skips a hit while paging', async () => {
    const store = buildBudgetStore();
    const limit = 10;
    const seen = new Set<string>();
    let offset = 0;

    for (let guard = 0; guard < DOCUMENT_COUNT; guard += 1) {
      const reply = await callSearch({ store, args: { query: TERM, limit, offset } });
      const result = JSON.parse(reply.result?.content[0]?.text ?? '{}');

      expect(result.returned).toBe(result.hits.length);
      if (offset === 0) {
        expect(result.total).toBe(DOCUMENT_COUNT);
        expect(result.returned).toBeLessThan(limit);
      }

      for (const hit of result.hits as { id: string }[]) {
        expect(seen.has(hit.id)).toBe(false);
        seen.add(hit.id);
      }

      if (result.nextOffset === undefined) {
        expect(offset + result.returned).toBe(result.total);
        break;
      }

      expect(result.nextOffset).toBe(offset + result.returned);
      offset = result.nextOffset;
    }

    expect(seen.size).toBe(DOCUMENT_COUNT);
  });

  test('a snippet no longer repeats the heading path the hit already carries as its own field', async () => {
    const store = buildBudgetStore();
    const reply = await callSearch({ store, args: { query: TERM, limit: 1, offset: 0 } });
    const result = JSON.parse(reply.result?.content[0]?.text ?? '{}');
    const [hit] = result.hits as { headingPath: string; snippet: string }[];

    expect(hit.snippet.startsWith(hit.headingPath)).toBe(false);
  });
});

describe('search tool: the symbol field', () => {
  const symbols = new SymbolStore({
    symbols: [
      {
        name: 'bootChecks',
        package: '@venizia/ignis-boot',
        subpath: '.',
        specifier: '@venizia/ignis-boot',
        kind: 'const',
        file: 'packages/boot/src/common/types.ts',
        line: 12,
        signature: 'const bootChecks: IBootChecks',
      },
    ],
  });

  const callWithSymbols = async (query: string) => {
    const transport = new Transport({
      tools: [buildSearchTool({ store: buildFixtureStore(), symbols })],
      serverName: 'atlas-test',
      serverVersion: '0.0.0',
    });
    const reply = await transport.handleLine({
      line: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search', arguments: { query } },
      }),
    });
    const parsed = JSON.parse(reply ?? 'null');
    return JSON.parse(parsed.result?.content[0]?.text ?? '{}');
  };

  test('a single identifier the table knows carries the symbol beside the hits', async () => {
    const result = await callWithSymbols('bootChecks');

    expect(result.symbol).toEqual({
      name: 'bootChecks',
      package: '@venizia/ignis-boot',
      specifier: '@venizia/ignis-boot',
      kind: 'const',
      file: 'packages/boot/src/common/types.ts',
      line: 12,
    });
  });

  test('a prose query carries no symbol', async () => {
    const result = await callWithSymbols('how do artifacts register');

    expect(result.symbol).toBeUndefined();
  });

  test('a single identifier the table does not know carries no symbol', async () => {
    const result = await callWithSymbols('unknownIdentifier');

    expect(result.symbol).toBeUndefined();
  });
});
