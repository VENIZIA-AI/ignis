import { Corpora } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import type { IChunk } from '@/corpus';
import { Transport } from '@/protocol';
import { Authorities } from '@/search/common';
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

describe('get tool: a document id with no anchor reads the whole document (I4)', () => {
  const store = buildFixtureStore();
  const DOCUMENT_ID = 'wiki:guide.md';

  test('joins every section in document order, each preceded by its own heading', async () => {
    const chunks = store.list({ document: 'guide.md' });
    expect(chunks.length).toBeGreaterThan(1);

    const reply = await callGet({ store, args: { id: DOCUMENT_ID, maxChars: 50000 } });
    const result = JSON.parse(reply.result?.content[0]?.text ?? '{}');

    expect(result.id).toBe(DOCUMENT_ID);
    expect(result.next).toBeUndefined();
    for (const chunk of chunks) {
      expect(result.body).toContain(chunk.body);
      if (chunk.anchor !== '') {
        expect(result.body).toContain(chunk.title);
      }
    }
  });

  test('pages the joined body under the same maxChars and cursor rules as a single chunk', async () => {
    const whole = await callGet({ store, args: { id: DOCUMENT_ID, maxChars: 50000 } });
    const wholeResult = JSON.parse(whole.result?.content[0]?.text ?? '{}');
    expect(wholeResult.body.length).toBeGreaterThan(1000);

    const first = await callGet({ store, args: { id: DOCUMENT_ID, maxChars: 500 } });
    const firstResult = JSON.parse(first.result?.content[0]?.text ?? '{}');
    expect(firstResult.body.length).toBe(500);
    expect(typeof firstResult.next).toBe('string');

    const second = await callGet({
      store,
      args: { id: DOCUMENT_ID, maxChars: 500, cursor: firstResult.next },
    });
    const secondResult = JSON.parse(second.result?.content[0]?.text ?? '{}');

    expect(firstResult.body + secondResult.body).toBe(
      wholeResult.body.slice(0, firstResult.body.length + secondResult.body.length),
    );
  });

  test('an unknown document id is -32602 pointing back at search, same as an unknown chunk id', async () => {
    const reply = await callGet({ store, args: { id: 'wiki:no-such-document.md' } });
    expect(reply.error).toEqual({ code: -32602, message: 'unknown id; ids come from search' });
  });

  test('an id with an unknown corpus prefix is -32602 pointing back at search', async () => {
    const reply = await callGet({ store, args: { id: 'bogus:guide.md' } });
    expect(reply.error).toEqual({ code: -32602, message: 'unknown id; ids come from search' });
  });
});

describe('get tool: code-point paging and cursor validation', () => {
  const MULTIBYTE_ID = 'wiki:multibyte.md#body';

  // `GetInputSchema.maxChars` floors at 500, so a "small maxChars" page boundary can only ever land
  // at code-point offset 500 - this body places an astral emoji (a surrogate pair in UTF-16)
  // exactly at code-point index 499, the last code point of a maxChars: 500 first page. Slicing by
  // UTF-16 unit instead of code point would cut this exact emoji in half (verified with a throwaway
  // script: `body.slice(0, 500)` on this fixture is NOT `String.prototype.isWellFormed()`).
  const FILLER = 'a'.repeat(499);
  const MULTIBYTE_BODY = `${FILLER}😀 và các bạn tiếng Việt có dấu nhé, cùng một biểu tượng nữa 🎉 để kiểm tra trang tiếp theo.`;

  const buildMultibyteStore = (): ChunkStore => {
    const chunk: IChunk = {
      id: MULTIBYTE_ID,
      corpus: Corpora.WIKI,
      document: 'multibyte.md',
      anchor: 'body',
      headingPath: 'Multibyte body',
      title: 'Multibyte body',
      body: MULTIBYTE_BODY,
      symbols: '',
      metadata: '',
      authority: Authorities.CANONICAL,
    };
    const store = new ChunkStore();
    store.add({ chunks: [chunk] });
    return store;
  };

  test('paging a body with Vietnamese text and emoji never splits a code point', async () => {
    const store = buildMultibyteStore();
    const totalCodePoints = Array.from(MULTIBYTE_BODY).length;
    expect(totalCodePoints).toBeGreaterThan(500);

    const first = await callGet({ store, args: { id: MULTIBYTE_ID, maxChars: 500 } });
    const firstResult = JSON.parse(first.result?.content[0]?.text ?? '{}');
    expect(Array.from(firstResult.body).length).toBe(500);
    expect(firstResult.body.isWellFormed()).toBe(true);
    expect(typeof firstResult.next).toBe('string');

    const second = await callGet({
      store,
      args: { id: MULTIBYTE_ID, maxChars: 500, cursor: firstResult.next },
    });
    const secondResult = JSON.parse(second.result?.content[0]?.text ?? '{}');
    expect(secondResult.body.isWellFormed()).toBe(true);
    expect(secondResult.next).toBeUndefined();

    // No gap, no overlap, and no code point lost or corrupted at the page boundary.
    expect(firstResult.body + secondResult.body).toBe(MULTIBYTE_BODY);
  });

  test('a malformed cursor is -32602 invalid cursor', async () => {
    const store = buildMultibyteStore();
    const reply = await callGet({
      store,
      args: { id: MULTIBYTE_ID, cursor: 'not-a-cursor' },
    });
    expect(reply.error).toEqual({ code: -32602, message: 'invalid cursor' });
  });

  test('a cursor pointing past the end of the body is -32602 invalid cursor', async () => {
    const store = buildMultibyteStore();
    const totalCodePoints = Array.from(MULTIBYTE_BODY).length;
    const pastTheEnd = Buffer.from(String(totalCodePoints + 1), 'utf8').toString('base64');

    const reply = await callGet({
      store,
      args: { id: MULTIBYTE_ID, cursor: pastTheEnd },
    });
    expect(reply.error).toEqual({ code: -32602, message: 'invalid cursor' });
  });
});
