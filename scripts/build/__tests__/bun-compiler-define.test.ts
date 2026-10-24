import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunCompiler } from '../../../packages/dev-configs/src/compilers/bun';

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

describe('BunCompiler.compile workers', () => {
  test('a worker listed in workers is compiled into the binary and runs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-compile-workers-'));
    tmpDirs.push(root);
    const entrypoint = join(root, 'entry.ts');
    const worker = join(root, 'echo.worker.ts');
    const outfile = join(root, 'bin');
    writeFileSync(
      worker,
      "declare const self: Worker; self.onmessage = event => self.postMessage('echo:' + event.data);",
    );
    writeFileSync(
      entrypoint,
      'const worker = new Worker("./echo.worker.ts"); worker.onmessage = event => { console.log(event.data); process.exit(0); }; worker.postMessage("ping");',
    );

    await BunCompiler.compile({ entrypoint, outfile, target: hostTarget, workers: [worker] });
    // Run from elsewhere: the worker must come from the binary, not from the source folder.
    rmSync(worker);
    const result = await Bun.$`${outfile}`.cwd(tmpdir()).quiet().nothrow();

    expect(result.stdout.toString().trim()).toBe('echo:ping');
  });
});

describe('BunCompiler.compile check', () => {
  test('with check, a type error stops the compile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-compile-check-'));
    tmpDirs.push(root);
    const entrypoint = join(root, 'entry.ts');
    writeFileSync(entrypoint, 'const count: number = "three";\nconsole.log(count);\n');

    const compiled = BunCompiler.compile({
      entrypoint,
      outfile: join(root, 'bin'),
      target: hostTarget,
      check: true,
    });

    expect(compiled).rejects.toThrow('TS2322');
  });

  test('without check, the same entry compiles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-compile-nocheck-'));
    tmpDirs.push(root);
    const entrypoint = join(root, 'entry.ts');
    const outfile = join(root, 'bin');
    writeFileSync(entrypoint, 'const count: number = "three";\nconsole.log(count);\n');

    await BunCompiler.compile({ entrypoint, outfile, target: hostTarget });
    const result = await Bun.$`${outfile}`.quiet().nothrow();

    expect(result.stdout.toString().trim()).toBe('three');
  });
});
