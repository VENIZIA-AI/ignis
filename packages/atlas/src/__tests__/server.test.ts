import { AtlasModes } from '@/common';
import type { TAtlasMode } from '@/common';
import { RpcError } from '@/protocol/common';
import { buildServer } from '@/server';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

// __dirname, not import.meta: tsconfig.json (unlike tsconfig.build.json) does not exclude
// __tests__, and this package's module mode treats every file as CommonJS output.
const REPOSITORY_ROOT = join(__dirname, '../../../..');
const FIXTURES = join(__dirname, 'fixtures/corpus');
const TEST_VERSION = '0.0.0-test';

const tempDirectories: string[] = [];

const makeTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-server-test-'));
  tempDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories.length = 0;
});

const parseReply = (
  line: string | null,
): {
  result?: {
    tools?: { name: string }[];
    content?: { text: string }[];
    serverInfo?: { version?: string };
  };
  error?: { message: string };
} => JSON.parse(line ?? 'null');

const listToolNames = async (opts: {
  transport: ReturnType<typeof buildServer>;
}): Promise<string[]> => {
  const reply = parseReply(
    await opts.transport.handleLine({
      line: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
  return (reply.result?.tools ?? []).map(tool => tool.name);
};

describe('buildServer', () => {
  test('repo mode exposes exactly the search, get and symbol tools', async () => {
    const transport = buildServer({
      mode: AtlasModes.REPOSITORY,
      root: REPOSITORY_ROOT,
      version: TEST_VERSION,
    });
    expect(await listToolNames({ transport })).toEqual(['search', 'get', 'symbol']);
  });

  test('serverInfo.version is whatever version buildServer was given, not a hardcoded string (I6)', async () => {
    const transport = buildServer({
      mode: AtlasModes.REPOSITORY,
      root: REPOSITORY_ROOT,
      version: TEST_VERSION,
    });
    const reply = parseReply(
      await transport.handleLine({
        line: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      }),
    );

    expect(reply.result?.serverInfo?.version).toBe(TEST_VERSION);
  });

  test('snapshot mode loads the packaged corpus and can answer a search', async () => {
    const root = makeTempDirectory();
    cpSync(join(FIXTURES, 'wiki'), join(root, 'corpus/wiki'), { recursive: true });
    cpSync(join(FIXTURES, 'changelogs'), join(root, 'corpus/changelogs'), { recursive: true });

    const transport = buildServer({ mode: AtlasModes.SNAPSHOT, root, version: TEST_VERSION });
    expect(await listToolNames({ transport })).toEqual(['search', 'get', 'symbol']);

    const reply = parseReply(
      await transport.handleLine({
        line: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'search', arguments: { query: 'registering artifacts' } },
        }),
      }),
    );

    const text = reply.result?.content?.[0]?.text ?? '{}';
    const searchResult: { hits: unknown[] } = JSON.parse(text);
    expect(searchResult.hits.length).toBeGreaterThan(0);
  });

  test('a snapshot packaged without a symbol table says so instead of failing to start', async () => {
    const root = makeTempDirectory();
    cpSync(join(FIXTURES, 'wiki'), join(root, 'corpus/wiki'), { recursive: true });
    cpSync(join(FIXTURES, 'changelogs'), join(root, 'corpus/changelogs'), { recursive: true });

    const transport = buildServer({ mode: AtlasModes.SNAPSHOT, root, version: TEST_VERSION });
    const reply = parseReply(
      await transport.handleLine({
        line: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'symbol', arguments: { name: 'getError' } },
        }),
      }),
    );

    expect(reply.error?.message).toBe('no symbol table in this build');
  });

  test('repo mode answers symbol from the generated table', async () => {
    const transport = buildServer({
      mode: AtlasModes.REPOSITORY,
      root: REPOSITORY_ROOT,
      version: TEST_VERSION,
    });
    const reply = parseReply(
      await transport.handleLine({
        line: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'symbol', arguments: { name: 'getError', package: 'helpers' } },
        }),
      }),
    );

    const payload: { name?: string; file?: string; matches?: unknown[] } = JSON.parse(
      reply.result?.content?.[0]?.text ?? '{}',
    );
    const first = payload.matches ? payload.matches[0] : payload;

    expect(reply.error?.message).toBeUndefined();
    expect(JSON.stringify(first)).toContain('getError');
  });

  test('a root with neither docs/wiki/content nor corpus/ throws a plain, RpcError-free error before any stdout write', () => {
    const root = makeTempDirectory();
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    const modes: TAtlasMode[] = [AtlasModes.REPOSITORY, AtlasModes.SNAPSHOT];

    try {
      for (const mode of modes) {
        let caught: unknown;
        try {
          buildServer({ mode, root, version: TEST_VERSION });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        expect(caught).not.toBeInstanceOf(RpcError);
      }

      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });
});
