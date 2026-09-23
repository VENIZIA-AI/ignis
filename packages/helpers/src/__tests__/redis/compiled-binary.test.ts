import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../package-root';

/**
 * A `bun build --compile` binary ships without `node_modules`, and an optional peer loaded by name
 * is invisible to the bundler - so the binary cannot find it, even when the entry imported it. The
 * binary here is built and run for real, in an empty directory, the way BANA's production image runs.
 */
const PROBE = `
import { LoggerFactory, ModuleUtility, RedisSingleHelper } from '${PACKAGE_ROOT}/dist/esm/index.js';
import { BullMQHelper } from '${PACKAGE_ROOT}/dist/esm/modules/queue/bullmq/index.js';
import * as ioredis from 'ioredis';
import * as bullmq from 'bullmq';

const silent = { debug() {}, info() {}, warn() {}, error() {}, emerg() {}, log() {}, for() { return silent; } };
LoggerFactory.use({ provider: { get: () => silent } });

const mode = process.argv[2];
if (mode === 'register') {
  ModuleUtility.register({ modules: { ioredis } });
}

try {
  const redis = new RedisSingleHelper({
    name: 'probe',
    host: '127.0.0.1',
    port: 6399,
    autoConnect: false,
    module: mode === 'seam' || mode === 'bullmq' ? ioredis : undefined,
  });

  if (mode === 'bullmq') {
    new BullMQHelper({ identifier: 'probe', queueName: 'probe', role: 'queue', redisConnection: redis, module: bullmq });
  }
  console.log('RESULT ok');
} catch (error) {
  console.log('RESULT threw ' + (error instanceof Error ? error.message : String(error)).split('\\n')[0]);
}
process.exit(0);
`;

let workDirectory: string;
let binary: string;

const runBinary = (opts: { mode: string }): string => {
  const run = Bun.spawnSync({
    cmd: [binary, opts.mode],
    cwd: workDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return (
    run.stdout
      .toString()
      .split('\n')
      .find(line => line.startsWith('RESULT')) ??
    `no RESULT line | ${run.stderr.toString().slice(0, 300)}`
  );
};

describe('optional peers inside a compiled binary', () => {
  beforeAll(async () => {
    // The entry must sit in the package, where ioredis and bullmq resolve at build time; the
    // binary then runs from a directory with no node_modules anywhere above it.
    const entry = path.join(PACKAGE_ROOT, 'src/__tests__/.compiled-binary-probe.ts');
    workDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-compiled-'));
    binary = path.join(workDirectory, 'probe');

    await writeFile(entry, PROBE);
    try {
      const built = await Bun.build({
        entrypoints: [entry],
        target: 'bun',
        compile: { outfile: binary },
      });
      if (!built.success) {
        throw new Error(built.logs.map(log => String(log)).join('\n'));
      }
    } finally {
      await rm(entry, { force: true });
    }
  }, 120_000);

  afterAll(async () => {
    await rm(workDirectory, { recursive: true, force: true });
  });

  test('without the module passed or registered, the binary says which peer and why', () => {
    expect(runBinary({ mode: 'none' })).toContain('ioredis is required');
  });

  test('ioredis passed as the module option: the client builds', () => {
    expect(runBinary({ mode: 'seam' })).toBe('RESULT ok');
  });

  test('ioredis registered once at the entry: the client builds', () => {
    expect(runBinary({ mode: 'register' })).toBe('RESULT ok');
  });

  test('bullmq passed as the module option: the queue builds', () => {
    expect(runBinary({ mode: 'bullmq' })).toBe('RESULT ok');
  });
});
