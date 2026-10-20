import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunCompiler } from '../../packages/dev-configs/src/compilers/bun';

/**
 * `BunCompiler.compile({ define })` is how a compile script bakes a value (the build stamp) into
 * the binary. The proof is the binary itself: compile a one-line entry that prints a defined
 * constant, run it, read what it printed.
 */

const tmpDirs: string[] = [];

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The host's own compile target, so the test never downloads a foreign Bun runtime. */
const hostTarget = `bun-${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;

const compileAndRun = async (opts: { source: string; define?: Record<string, string> }) => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-compile-define-'));
  tmpDirs.push(root);

  const entrypoint = join(root, 'entry.ts');
  const outfile = join(root, 'bin');
  writeFileSync(entrypoint, opts.source);

  await BunCompiler.compile({ entrypoint, outfile, target: hostTarget, define: opts.define });

  const result = await Bun.$`${outfile}`.quiet().nothrow();
  return result.stdout.toString().trim();
};

describe('BunCompiler.compile define', () => {
  test('a defined constant is baked into the binary', async () => {
    const stamp = { commit: 'abc123def456', branch: 'release' };

    const printed = await compileAndRun({
      source:
        'declare const BAKED: { commit: string; branch: string }; console.log(BAKED.commit, BAKED.branch);',
      define: { BAKED: JSON.stringify(stamp) },
    });

    expect(printed).toBe('abc123def456 release');
  });

  test('without define the constant is not baked', async () => {
    const printed = await compileAndRun({
      source: 'declare const BAKED: unknown; console.log(typeof BAKED);',
    });

    expect(printed).toBe('undefined');
  });
});
