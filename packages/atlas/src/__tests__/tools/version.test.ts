import { Transport } from '@/protocol';
import { ReleaseStore } from '@/releases';
import type { IReleaseTable } from '@/releases';
import { buildVersionTool } from '@/tools/version.tool';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

const TABLE: IReleaseTable = {
  releases: {
    kernel: [
      { version: '0.2.0-21', date: '2026-09-06', sha: 'aa0644f5' },
      { version: '0.2.0-11', date: '2026-08-20', sha: 'bbbbbbbb' },
    ],
    helpers: [{ version: '0.2.0-15', date: '2026-09-06', sha: 'da8e45c2' }],
  },
  changelogs: [],
};

const releases = new ReleaseStore({ table: TABLE });

// $HOME/.cache, never /tmp: a fixture tree with a node_modules directory must live where the
// developer's own caches live, not on a mount a sandbox may hide or mount noexec.
const CACHE_ROOT = join(homedir(), '.cache');
const directories: string[] = [];

const makeDirectory = (): string => {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const directory = mkdtempSync(join(CACHE_ROOT, 'atlas-version-test-'));
  directories.push(directory);
  return directory;
};

const writeJson = (opts: { file: string; value: unknown }): void => {
  mkdirSync(dirname(opts.file), { recursive: true });
  writeFileSync(opts.file, `${JSON.stringify(opts.value, null, 2)}\n`);
};

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface IVersionPayload {
  installed: Record<string, string | null>;
  snapshot: Record<string, string>;
  behind: { package: string; installed: string; newest: string }[];
}

const callVersion = async (opts: {
  releases: ReleaseStore;
  args: Record<string, unknown>;
}): Promise<{
  error?: { code: number; message: string };
  result?: { content: { type: string; text: string }[] };
}> => {
  const transport = new Transport({
    tools: [buildVersionTool({ releases: opts.releases })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });
  const reply = await transport.handleLine({
    line: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'version', arguments: opts.args },
    }),
  });
  return JSON.parse(reply ?? 'null');
};

const payloadOf = (reply: { result?: { content: { text: string }[] } }): IVersionPayload =>
  JSON.parse(reply.result?.content[0]?.text ?? '{}');

describe('version tool', () => {
  test('resolves the real installed version out of node_modules, not the declared range', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', dependencies: { '@venizia/ignis-kernel': '^0.2.0-11' } },
    });
    writeJson({
      file: join(cwd, 'node_modules/@venizia/ignis-kernel/package.json'),
      value: { name: '@venizia/ignis-kernel', version: '0.2.0-11' },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.installed['@venizia/ignis-kernel']).toBe('0.2.0-11');
  });

  test('names the newest version this table knows, per package', async () => {
    const cwd = makeDirectory();
    writeJson({ file: join(cwd, 'package.json'), value: { name: 'consumer' } });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.snapshot).toEqual({ helpers: '0.2.0-15', kernel: '0.2.0-21' });
  });

  test('lists a package behind the newest known version, named by its directory', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', dependencies: { '@venizia/ignis-kernel': '^0.2.0-11' } },
    });
    writeJson({
      file: join(cwd, 'node_modules/@venizia/ignis-kernel/package.json'),
      value: { name: '@venizia/ignis-kernel', version: '0.2.0-11' },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.behind).toEqual([
      { package: 'kernel', installed: '0.2.0-11', newest: '0.2.0-21' },
    ]);
  });

  test('a package already on the newest version is not behind', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', devDependencies: { '@venizia/ignis-kernel': '0.2.0-21' } },
    });
    writeJson({
      file: join(cwd, 'node_modules/@venizia/ignis-kernel/package.json'),
      value: { name: '@venizia/ignis-kernel', version: '0.2.0-21' },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.behind).toEqual([]);
  });

  test('a declared range with nothing installed reads null, and is never counted as behind', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', dependencies: { '@venizia/ignis-kernel': '^0.2.0-11' } },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.installed['@venizia/ignis-kernel']).toBeNull();
    expect(payload.behind).toEqual([]);
  });

  test('a declared exact version with nothing installed is a version, not a range', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', dependencies: { '@venizia/ignis-kernel': '0.2.0-11' } },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.installed['@venizia/ignis-kernel']).toBe('0.2.0-11');
    expect(payload.behind).toEqual([
      { package: 'kernel', installed: '0.2.0-11', newest: '0.2.0-21' },
    ]);
  });

  test('a dependency outside the @venizia scope is not reported', async () => {
    const cwd = makeDirectory();
    writeJson({
      file: join(cwd, 'package.json'),
      value: { name: 'consumer', dependencies: { hono: '^4.13.7' } },
    });

    const payload = payloadOf(await callVersion({ releases, args: { cwd } }));

    expect(payload.installed).toEqual({});
  });

  test('a directory with no package.json answers with an empty installed, not an error', async () => {
    const cwd = makeDirectory();

    const reply = await callVersion({ releases, args: { cwd } });
    const payload = payloadOf(reply);

    expect(reply.error).toBeUndefined();
    expect(payload.installed).toEqual({});
    expect(payload.behind).toEqual([]);
  });

  test('a build with no release table says so instead of guessing', async () => {
    const reply = await callVersion({
      releases: new ReleaseStore({ table: { releases: {}, changelogs: [] } }),
      args: {},
    });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe('no release table in this build');
  });
});
