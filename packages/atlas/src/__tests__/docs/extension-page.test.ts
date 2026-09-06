import { Chunker, CorpusLoader, resolveRepoRoots } from '@/corpus';
import { Transport } from '@/protocol';
import { ChunkStore } from '@/search';
import { buildGetTool } from '@/tools/get.tool';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: tsconfig.json (unlike tsconfig.build.json) does not exclude
// __tests__, and this package's module mode treats every file as CommonJS output.
const REPO_ROOT = join(__dirname, '../../../../..');
const EXTENSION_PAGE = join(REPO_ROOT, 'docs/wiki/content/extensions/atlas/index.md');

// A real citation id, e.g. `wiki:guide.md#anchor` - never a format placeholder like
// `wiki:<path>#<anchor>`, which is excluded by rejecting `<`/`>` inside the match.
const ID_PATTERN = /`((?:wiki|changelog|okf):[^`<>]+)`/g;

const idsQuotedOn = (opts: { page: string }): string[] => {
  const text = readFileSync(opts.page, 'utf8');
  return [...text.matchAll(ID_PATTERN)].map(match => match[1]);
};

const hasRepositoryRoots =
  existsSync(join(REPO_ROOT, 'docs/wiki/content')) &&
  existsSync(join(REPO_ROOT, '.agents/knowledge'));

const parseReply = (line: string | null): { error?: { message: string } } =>
  JSON.parse(line ?? 'null');

describe.skipIf(!hasRepositoryRoots)(
  'every id quoted on the atlas extension page resolves in the real index (I7)',
  () => {
    const ids = idsQuotedOn({ page: EXTENSION_PAGE });
    const documents = CorpusLoader.getInstance().load({
      roots: resolveRepoRoots({ repoRoot: REPO_ROOT }),
    });
    const chunker = Chunker.getInstance();
    const store = new ChunkStore();
    store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });
    const transport = new Transport({
      tools: [buildGetTool({ store })],
      serverName: 'atlas-test',
      serverVersion: '0.0.0',
    });

    test('the page quotes at least one real id', () => {
      expect(ids.length).toBeGreaterThan(0);
    });

    const rows: Array<[string]> = ids.map(id => [id]);
    test.each(rows)('%s resolves through the get tool', async id => {
      const reply = await transport.handleLine({
        line: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get', arguments: { id } },
        }),
      });
      const parsed = parseReply(reply);

      expect(parsed.error, parsed.error?.message).toBeUndefined();
    });
  },
);
