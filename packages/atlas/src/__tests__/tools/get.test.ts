import { Corpora } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import { Transport } from '@/protocol';
import { ChunkStore } from '@/search/store';
import { buildGetTool } from '@/tools/get.tool';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const FIXTURES_ROOT = join(__dirname, '../fixtures/corpus');

// The longest fixture chunk (guide.md's "Registering artifacts" section, well over 500 chars) -
// long enough to exercise a maxChars page boundary and a continuing cursor.
const KNOWN_ID = 'changelog:2026-01-01-thing#a-sample-change';
const LONG_ID = 'wiki:guide.md#registering-artifacts';

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

const callGet = async (opts: {
  store: ChunkStore;
  args: Record<string, unknown>;
}): Promise<{
  error?: { code: number; message: string };
  result?: { content: { type: string; text: string }[] };
}> => {
  const transport = new Transport({
    tools: [buildGetTool({ store: opts.store })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });
  const reply = await transport.handleLine({
    line: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get', arguments: opts.args },
    }),
  });
  return JSON.parse(reply ?? 'null');
};

describe('get tool', () => {
  const store = buildFixtureStore();

  test('a known id returns its body with no next cursor', async () => {
    const chunk = store.get({ id: KNOWN_ID });
    const reply = await callGet({ store, args: { id: KNOWN_ID } });
    const result = JSON.parse(reply.result?.content[0]?.text ?? '{}');

    expect(result.body).toBe(chunk?.body);
    expect(result.next).toBeUndefined();
  });

  test('maxChars: 500 on a long chunk pages exactly, with no gap or overlap', async () => {
    const chunk = store.get({ id: LONG_ID });
    expect(chunk?.body.length ?? 0).toBeGreaterThan(500);

    const first = await callGet({ store, args: { id: LONG_ID, maxChars: 500 } });
    const firstResult = JSON.parse(first.result?.content[0]?.text ?? '{}');
    expect(firstResult.body.length).toBe(500);
    expect(typeof firstResult.next).toBe('string');

    const second = await callGet({
      store,
      args: { id: LONG_ID, maxChars: 500, cursor: firstResult.next },
    });
    const secondResult = JSON.parse(second.result?.content[0]?.text ?? '{}');

    expect(firstResult.body + secondResult.body).toBe(chunk?.body);
    expect(secondResult.next).toBeUndefined();
  });

  test('an unknown id is -32602 pointing back at search', async () => {
    const reply = await callGet({ store, args: { id: 'wiki:missing#nope' } });
    expect(reply.error).toEqual({ code: -32602, message: 'unknown id; ids come from search' });
  });
});
