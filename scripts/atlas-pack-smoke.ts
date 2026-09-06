#!/usr/bin/env bun
/**
 * Proves the packed tarball starts outside the workspace: pack, install into an empty directory,
 * run `initialize` + `tools/list` + one `search` over stdio. Catches a dependency the workspace
 * hoists but the manifest never declared - the gate `bun test` cannot see.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE_DIRECTORY = resolve(import.meta.dir, '..', 'packages', 'atlas');
const PACKAGE_NAME = '@venizia/ignis-atlas';

const run = (opts: { command: string[]; cwd: string; input?: string }) => {
  const result = spawnSync(opts.command[0], opts.command.slice(1), {
    cwd: opts.cwd,
    input: opts.input,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

class SmokeFailure extends Error {}

const fail = (message: string): never => {
  throw new SmokeFailure(message);
};

const main = (): void => {
  const packed = run({ command: ['bun', 'pm', 'pack', '--quiet'], cwd: PACKAGE_DIRECTORY });
  if (packed.status !== 0) {
    fail(`bun pm pack exited ${packed.status}\n${packed.stderr}`);
  }
  const tarball = readdirSync(PACKAGE_DIRECTORY)
    .filter(name => name.endsWith('.tgz'))
    .map(name => join(PACKAGE_DIRECTORY, name))
    .sort()
    .at(-1);
  if (!tarball) {
    fail('no tarball produced');
  }

  const sandbox = mkdtempSync(join(tmpdir(), 'ignis-atlas-smoke-'));
  try {
    const installed = run({ command: ['bun', 'add', tarball!], cwd: sandbox });
    if (installed.status !== 0) {
      fail(`bun add ${tarball} exited ${installed.status}\n${installed.stderr}`);
    }

    const cli = join(sandbox, 'node_modules', ...PACKAGE_NAME.split('/'), 'dist', 'cjs', 'cli.js');
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'pack-smoke', version: '0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'application bootstrap' } },
      },
    ]
      .map(message => JSON.stringify(message))
      .join('\n');

    const session = run({ command: ['bun', cli, 'mcp'], cwd: sandbox, input: `${input}\n` });
    if (session.status !== 0) {
      fail(`cli exited ${session.status}\n${session.stderr.slice(-2000)}`);
    }

    const lines = session.stdout.split('\n').filter(line => line.length > 0);
    const messages = lines.map(line => {
      try {
        return JSON.parse(line) as { id?: number; result?: Record<string, unknown> };
      } catch {
        return fail(`stdout carries a non-JSON line: ${line.slice(0, 120)}`);
      }
    });

    const toolList = messages.find(message => message.id === 2)?.result as
      { tools?: { name: string }[] } | undefined;
    const names = (toolList?.tools ?? []).map(tool => tool.name).sort();
    if (names.join(',') !== 'get,search,symbol') {
      fail(`tools/list returned [${names.join(', ')}], expected [get, search, symbol]`);
    }

    const searched = messages.find(message => message.id === 3)?.result as
      { content?: { text: string }[] } | undefined;
    const payload = JSON.parse(searched?.content?.[0]?.text ?? '{}') as { total?: number };
    if (!payload.total || payload.total < 1) {
      fail(`search returned no hits in npm mode: ${JSON.stringify(payload).slice(0, 200)}`);
    }

    console.log(
      `pack-smoke: OK - ${names.join(', ')} listed, search total ${payload.total}, ${lines.length} JSON-RPC lines on stdout, stderr ${session.stderr.length} chars`,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(tarball!, { force: true });
  }
};

try {
  main();
} catch (error) {
  if (error instanceof SmokeFailure) {
    console.error(`pack-smoke: FAIL - ${error.message}`);
    process.exit(1);
  }
  throw error;
}
