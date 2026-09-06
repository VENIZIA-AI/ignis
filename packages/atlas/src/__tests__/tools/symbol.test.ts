import { AtlasConstants, Corpora } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import { Transport } from '@/protocol';
import { ChunkStore } from '@/search/store';
import { SymbolStore } from '@/symbols';
import type { ISymbolRecord } from '@/symbols';
import { buildSymbolTool } from '@/tools/symbol.tool';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const FIXTURES_ROOT = join(__dirname, '../fixtures/corpus');

const record = (opts: Partial<ISymbolRecord> & { name: string }): ISymbolRecord => ({
  package: '@venizia/ignis-helpers',
  subpath: '.',
  specifier: '@venizia/ignis-helpers',
  kind: 'function',
  file: 'packages/helpers/src/modules/error/error.ts',
  line: 42,
  signature: `${opts.name}(): void`,
  ...opts,
});

const SYMBOLS: ISymbolRecord[] = [
  record({ name: 'getError' }),
  record({ name: 'respond', package: '@venizia/ignis', specifier: '@venizia/ignis' }),
  record({ name: 'respond', package: '@venizia/ignis-kernel', specifier: '@venizia/ignis-kernel' }),
  record({ name: 'respondError' }),
];

const buildChunkStore = (): ChunkStore => {
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

const callSymbol = async (opts: {
  symbols: SymbolStore;
  args: Record<string, unknown>;
}): Promise<{
  error?: { code: number; message: string };
  result?: { content: { type: string; text: string }[] };
}> => {
  const transport = new Transport({
    tools: [buildSymbolTool({ store: buildChunkStore(), symbols: opts.symbols })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });
  const reply = await transport.handleLine({
    line: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'symbol', arguments: opts.args },
    }),
  });
  return JSON.parse(reply ?? 'null');
};

const payloadOf = (reply: { result?: { content: { text: string }[] } }) =>
  JSON.parse(reply.result?.content[0]?.text ?? '{}');

describe('symbol tool', () => {
  const symbols = new SymbolStore({ symbols: SYMBOLS });

  test('an empty name is -32602 with a message naming the field', async () => {
    const reply = await callSymbol({ symbols, args: { name: '' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toContain('name');
  });

  test('a hit answers with the record and its doc citations, inside the search budget', async () => {
    const reply = await callSymbol({ symbols, args: { name: 'getError' } });
    const payload = payloadOf(reply);

    expect(payload.name).toBe('getError');
    expect(payload.package).toBe('@venizia/ignis-helpers');
    expect(payload.subpath).toBe('.');
    expect(payload.specifier).toBe('@venizia/ignis-helpers');
    expect(payload.kind).toBe('function');
    expect(payload.file).toBe('packages/helpers/src/modules/error/error.ts');
    expect(payload.line).toBe(42);
    expect(payload.signature).toBe('getError(): void');
    expect(Array.isArray(payload.docs)).toBe(true);
    expect(payload.docs.length).toBeLessThanOrEqual(5);
    expect(reply.result?.content[0]?.text.length).toBeLessThanOrEqual(
      AtlasConstants.SEARCH_BUDGET_CHARS,
    );
  });

  test('a name in two packages answers with every match', async () => {
    const payload = payloadOf(await callSymbol({ symbols, args: { name: 'respond' } }));

    expect(payload.matches).toHaveLength(2);
    expect(payload.matches.map((match: ISymbolRecord) => match.package).sort()).toEqual([
      '@venizia/ignis',
      '@venizia/ignis-kernel',
    ]);
  });

  test('a package filter narrows an ambiguous name back to one record', async () => {
    const payload = payloadOf(
      await callSymbol({ symbols, args: { name: 'respond', package: 'kernel' } }),
    );

    expect(payload.matches).toBeUndefined();
    expect(payload.package).toBe('@venizia/ignis-kernel');
  });

  test('an unknown name is -32602 naming the closest candidates', async () => {
    const reply = await callSymbol({ symbols, args: { name: 'respnd' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe("unknown symbol 'respnd'; did you mean respond?");
  });

  test('an unknown name with no close candidate still says which name is unknown', async () => {
    const reply = await callSymbol({ symbols, args: { name: 'zzzzzzzzzzz' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe("unknown symbol 'zzzzzzzzzzz'");
  });

  test('a name exported from nine specifiers still answers inside the budget', async () => {
    const crowded = new SymbolStore({
      symbols: Array.from({ length: 9 }, (_unused, index) =>
        record({
          name: 'AbstractSearchController',
          subpath: `./search/controllers/level-${index}`,
          specifier: `@venizia/ignis-connectors/search/controllers/level-${index}`,
          kind: 'class',
          file: 'packages/connectors/src/search/core/controllers/abstract.controller.ts',
          signature: `class AbstractSearchController${'X'.repeat(260)}`,
        }),
      ),
    });

    const reply = await callSymbol({
      symbols: crowded,
      args: { name: 'AbstractSearchController' },
    });
    const payload = payloadOf(reply);

    expect(reply.result?.content[0]?.text.length).toBeLessThanOrEqual(
      AtlasConstants.SEARCH_BUDGET_CHARS,
    );
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matches.length).toBeLessThan(9);
  });

  test('a build with no symbol table says so instead of guessing', async () => {
    const reply = await callSymbol({
      symbols: new SymbolStore({ symbols: [] }),
      args: { name: 'getError' },
    });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe('no symbol table in this build');
  });
});
