import { afterAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(
  import.meta.dir,
  '..',
  '..',
  'packages',
  'dev-configs',
  'src',
  'cli',
  'index.ts',
);
const TOOLS = ['oxlint', 'eslint', 'bun'];
const tmpDirs: string[] = [];

/** Folder of .configs to the content of its .ignore file. */
type TIgnoreFiles = Partial<Record<'lints' | 'formatters', string>>;

/** A project with stub linters on PATH that log their arguments, one line per call. */
const makeProject = (opts: { ignore?: TIgnoreFiles; failing?: string } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-dev-configs-lint-'));
  tmpDirs.push(root);
  const bin = join(root, 'stub-bin');
  const log = join(root, 'calls.log');

  mkdirSync(bin);
  for (const tool of TOOLS) {
    const body = tool === opts.failing ? 'exit 1' : `echo "${tool} $*" >> "${log}"`;
    writeFileSync(join(bin, tool), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, tool), 0o755);
  }

  for (const [folder, content] of Object.entries(opts.ignore ?? {})) {
    mkdirSync(join(root, '.configs', folder), { recursive: true });
    writeFileSync(join(root, '.configs', folder, '.ignore'), content);
  }

  writeFileSync(log, '');
  return { root, bin, log };
};

const runLint = (opts: { args: string[]; ignore?: TIgnoreFiles; failing?: string }) => {
  const project = makeProject({ ignore: opts.ignore, failing: opts.failing });
  const result = Bun.spawnSync({
    cmd: [process.execPath, CLI, 'lint', ...opts.args],
    cwd: project.root,
    env: { PATH: `${project.bin}:${process.env.PATH ?? ''}` },
  });
  const calls = readFileSync(project.log, 'utf8')
    .split('\n')
    .filter(line => line !== '');

  return { exitCode: result.exitCode, calls, stderr: result.stderr.toString() };
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('devz', () => {
  test('no argument checks the whole project', () => {
    const { exitCode, calls } = runLint({ args: [] });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --deny-warnings .',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ .',
      'bun fmt --no-script --check **/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}',
    ]);
  });

  test('--fix alone fixes the whole project', () => {
    const { calls } = runLint({ args: ['--fix'] });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --fix .',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --fix .',
      'bun fmt --no-script **/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}',
    ]);
  });

  test('a file list checks only those files, and the tools stay quiet about ignored ones', () => {
    const { calls } = runLint({ args: ['src/a.ts', 'src/b.tsx'] });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --no-error-on-unmatched-pattern --deny-warnings src/a.ts src/b.tsx',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored src/a.ts src/b.tsx',
      'bun fmt --no-script --no-error-on-unmatched-pattern --check src/a.ts src/b.tsx',
    ]);
  });

  test('--fix with a file list fixes only those files', () => {
    const { calls } = runLint({ args: ['--fix', 'src/a.ts'] });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --no-error-on-unmatched-pattern --fix src/a.ts',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored --fix src/a.ts',
      'bun fmt --no-script --no-error-on-unmatched-pattern src/a.ts',
    ]);
  });

  test('files the tools do not handle are dropped from the list', () => {
    const { calls } = runLint({ args: ['README.md', 'src/a.mts', 'package.json'] });

    expect(calls[0]).toBe(
      'oxlint -c .configs/lints/oxlint.config.mts --no-error-on-unmatched-pattern --deny-warnings src/a.mts',
    );
  });

  test('a css file alone is only formatted', () => {
    const { calls } = runLint({ args: ['site/theme.css'] });

    expect(calls).toEqual(['bun fmt --no-script --no-error-on-unmatched-pattern --check site/theme.css']);
  });

  test('a package.json alone is only formatted, with its keys sorted', () => {
    const { calls } = runLint({ args: ['packages/a/package.json'] });

    expect(calls).toEqual([
      'bun fmt --no-script --no-error-on-unmatched-pattern --check packages/a/package.json',
    ]);
  });

  test('a package.json beside code reaches bun fmt only', () => {
    const { calls } = runLint({ args: ['--fix', 'src/a.ts', 'package.json'] });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --no-error-on-unmatched-pattern --fix src/a.ts',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored --fix src/a.ts',
      'bun fmt --no-script --no-error-on-unmatched-pattern src/a.ts package.json',
    ]);
  });

  test('a list with no lintable file runs nothing and passes', () => {
    const { exitCode, calls } = runLint({ args: ['README.md', 'logo.png'] });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([]);
  });

  // An ignore file resolves its patterns from its own folder, so each .ignore reaches its tools as
  // command-line patterns, which resolve from the project root: --ignore-pattern for every tool here.
  test('lints/.ignore reaches oxlint and eslint, comments and blank lines skipped', () => {
    const { calls } = runLint({ args: [], ignore: { lints: '# generated\nsrc/gen/**\n\n*.ts\n' } });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --ignore-pattern src/gen/** --ignore-pattern *.ts --deny-warnings .',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --ignore-pattern src/gen/** --ignore-pattern *.ts .',
      'bun fmt --no-script --check **/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}',
    ]);
  });

  test('formatters/.ignore reaches bun fmt only', () => {
    const { calls } = runLint({ args: ['src/a.ts'], ignore: { formatters: 'src/vendor/**\n' } });

    expect(calls).toEqual([
      'oxlint -c .configs/lints/oxlint.config.mts --no-error-on-unmatched-pattern --deny-warnings src/a.ts',
      'eslint -c .configs/lints/eslint.config.mjs --cache --cache-location node_modules/.cache/eslint/ --no-warn-ignored src/a.ts',
      'bun fmt --no-script --no-error-on-unmatched-pattern --ignore-pattern src/vendor/** --check src/a.ts',
    ]);
  });

  test('a failing tool stops the run and fails it', () => {
    const { exitCode, calls } = runLint({ args: ['src/a.ts'], failing: 'eslint' });

    expect(exitCode).toBe(1);
    expect(calls).toHaveLength(1);
  });

  test('clean removes dist and the tool caches, and keeps everything else', () => {
    const project = makeProject();
    mkdirSync(join(project.root, 'dist'), { recursive: true });
    writeFileSync(join(project.root, 'dist', 'bin'), 'x');
    mkdirSync(join(project.root, 'node_modules', '.cache', 'eslint'), { recursive: true });
    mkdirSync(join(project.root, 'node_modules', 'zod'), { recursive: true });
    mkdirSync(join(project.root, 'src'), { recursive: true });

    const result = Bun.spawnSync({ cmd: ['bun', CLI, 'clean'], cwd: project.root });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project.root, 'dist'))).toBe(false);
    expect(existsSync(join(project.root, 'node_modules', '.cache'))).toBe(false);
    expect(existsSync(join(project.root, 'node_modules', 'zod'))).toBe(true);
    expect(existsSync(join(project.root, 'src'))).toBe(true);
  });

  test('clean in a project with nothing to clean passes', () => {
    const project = makeProject();
    const result = Bun.spawnSync({ cmd: ['bun', CLI, 'clean'], cwd: project.root });

    expect(result.exitCode).toBe(0);
  });

  test('an unknown command fails and names the commands there are', () => {
    const project = makeProject();
    const result = Bun.spawnSync({ cmd: ['bun', CLI, 'lnit'], cwd: project.root });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('lint');
  });
});
