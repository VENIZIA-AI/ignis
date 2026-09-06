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
const REPO_ROOT = join(__dirname, '../../../..');
const FIXTURES = join(__dirname, 'fixtures/corpus');

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-server-test-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

const parseReply = (
  line: string | null,
): {
  result?: { tools?: { name: string }[]; content?: { text: string }[] };
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
  test('repo mode exposes exactly the search and get tools', async () => {
    const transport = buildServer({ mode: AtlasModes.REPO, root: REPO_ROOT });
    expect(await listToolNames({ transport })).toEqual(['search', 'get']);
  });

  test('snapshot mode loads the packaged corpus and can answer a search', async () => {
    const root = makeTempDir();
    cpSync(join(FIXTURES, 'wiki'), join(root, 'corpus/wiki'), { recursive: true });
    cpSync(join(FIXTURES, 'changelogs'), join(root, 'corpus/changelogs'), { recursive: true });

    const transport = buildServer({ mode: AtlasModes.SNAPSHOT, root });
    expect(await listToolNames({ transport })).toEqual(['search', 'get']);

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

  test('a root with neither docs/wiki/content nor corpus/ throws a plain, RpcError-free error before any stdout write', () => {
    const root = makeTempDir();
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    const modes: TAtlasMode[] = [AtlasModes.REPO, AtlasModes.SNAPSHOT];

    try {
      for (const mode of modes) {
        let caught: unknown;
        try {
          buildServer({ mode, root });
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
