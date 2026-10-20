import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LINT_SCRIPT = resolve(import.meta.dir, '..', '..', 'presets', 'app', 'files', 'scripts', 'lint.sh');
const TOOLS = ['oxlint', 'eslint', 'oxfmt'];
const tmpDirs: string[] = [];

/** A package with scripts/lint.sh and stub linters on PATH that log their arguments, one line per call. */
const makePackage = (): { root: string; bin: string; log: string } => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-lint-script-'));
  tmpDirs.push(root);
  const bin = join(root, 'bin');
  const log = join(root, 'calls.log');

  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(bin);
  cpSync(LINT_SCRIPT, join(root, 'scripts', 'lint.sh'));

  for (const tool of TOOLS) {
    const stub = join(bin, tool);
    writeFileSync(stub, `#!/bin/sh\necho "${tool} $*" >> "${log}"\n`);
    chmodSync(stub, 0o755);
  }

  writeFileSync(log, '');
  return { root, bin, log };
};

const runLint = (opts: { args: string[]; lintIgnore?: string }): { exitCode: number; calls: string[] } => {
  const lintPackage = makePackage();
  if (opts.lintIgnore !== undefined) {
    mkdirSync(join(lintPackage.root, '.configs'), { recursive: true });
    writeFileSync(join(lintPackage.root, '.configs', '.lintignore'), opts.lintIgnore);
  }
  const result = Bun.spawnSync({
    cmd: ['sh', join(lintPackage.root, 'scripts', 'lint.sh'), ...opts.args],
    cwd: tmpdir(),
    env: { PATH: `${lintPackage.bin}:/usr/bin:/bin` },
  });
  const calls = readFileSync(lintPackage.log, 'utf8').split('\n').filter(line => line !== '');

  return { exitCode: result.exitCode, calls };
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('preset scripts/lint.sh', () => {
  test('no argument checks the whole package', () => {
    const { exitCode, calls } = runLint({ args: [] });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      'oxlint -c .configs/oxlint.config.mts --deny-warnings .',
      'eslint -c .configs/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ .',
      'oxfmt -c .configs/oxfmt.config.mts --check **/*.{ts,tsx,mts,js,mjs}',
    ]);
  });

  test('--fix alone fixes the whole package', () => {
    const { calls } = runLint({ args: ['--fix'] });

    expect(calls).toEqual([
      'oxlint -c .configs/oxlint.config.mts --fix .',
      'eslint -c .configs/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --fix .',
      'oxfmt -c .configs/oxfmt.config.mts **/*.{ts,tsx,mts,js,mjs}',
    ]);
  });

  test('a file list checks only those files, and eslint stays quiet about ignored ones', () => {
    const { calls } = runLint({ args: ['src/a.ts', 'src/b.tsx'] });

    expect(calls).toEqual([
      'oxlint -c .configs/oxlint.config.mts --no-error-on-unmatched-pattern --deny-warnings src/a.ts src/b.tsx',
      'eslint -c .configs/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored src/a.ts src/b.tsx',
      'oxfmt -c .configs/oxfmt.config.mts --no-error-on-unmatched-pattern --check src/a.ts src/b.tsx',
    ]);
  });

  test('--fix with a file list fixes only those files', () => {
    const { calls } = runLint({ args: ['--fix', 'src/a.ts'] });

    expect(calls).toEqual([
      'oxlint -c .configs/oxlint.config.mts --no-error-on-unmatched-pattern --fix src/a.ts',
      'eslint -c .configs/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored --fix src/a.ts',
      'oxfmt -c .configs/oxfmt.config.mts --no-error-on-unmatched-pattern src/a.ts',
    ]);
  });

  test('files the linters do not handle are dropped from the list', () => {
    const { calls } = runLint({ args: ['README.md', 'src/a.mts', 'package.json'] });

    expect(calls[0]).toBe('oxlint -c .configs/oxlint.config.mts --no-error-on-unmatched-pattern --deny-warnings src/a.mts');
  });

  test('a list with no lintable file runs nothing and passes', () => {
    const { exitCode, calls } = runLint({ args: ['README.md', 'package.json'] });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([]);
  });

  // An ignore file resolves its patterns from its own folder, so .configs/.lintignore reaches the tools as
  // command-line patterns, which resolve from the package root: --ignore-pattern, or !pattern for oxfmt.
  test('.configs/.lintignore reaches every tool, comments and blank lines skipped, globs left unexpanded', () => {
    const { calls } = runLint({ args: [], lintIgnore: '# generated\nsrc/gen/**\n\n*.ts\n' });

    expect(calls).toEqual([
      'oxlint -c .configs/oxlint.config.mts --ignore-pattern src/gen/** --ignore-pattern *.ts --deny-warnings .',
      'eslint -c .configs/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --ignore-pattern src/gen/** --ignore-pattern *.ts .',
      'oxfmt -c .configs/oxfmt.config.mts --check **/*.{ts,tsx,mts,js,mjs} !src/gen/** !*.ts',
    ]);
  });

  test('a failing tool fails the script', () => {
    const lintPackage = makePackage();
    writeFileSync(join(lintPackage.bin, 'eslint'), '#!/bin/sh\nexit 1\n');
    const result = Bun.spawnSync({
      cmd: ['sh', join(lintPackage.root, 'scripts', 'lint.sh'), 'src/a.ts'],
      env: { PATH: `${lintPackage.bin}:/usr/bin:/bin` },
    });

    expect(result.exitCode).toBe(1);
  });
});
