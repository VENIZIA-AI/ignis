import { Corpora } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import { Transport } from '@/protocol';
import { ChunkStore } from '@/search/store';
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
