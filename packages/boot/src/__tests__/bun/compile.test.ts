import { IgnisArtifactsPlugin } from '@/bun';
import type { BunPlugin } from 'bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXTURES = resolve(process.cwd(), 'src', '__tests__', 'fixtures');
const KERNEL_STUB = resolve(process.cwd(), 'src', '__tests__', 'bun', 'kernel-stub-module.ts');
const AUTO_SOURCE = resolve(process.cwd(), 'src', 'bun', 'auto.ts');
const workspace = mkdtempSync(join(tmpdir(), 'ignis-compile-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** Points the two framework specifiers at this repository's sources: the kernel at a stub, `@venizia/ignis-boot/auto` at the real module. */
const frameworkSources: BunPlugin = {
  name: 'framework-sources',
  setup(build) {
    build.onResolve({ filter: /^@venizia\/ignis-kernel$/ }, () => ({ path: KERNEL_STUB }));
    build.onResolve({ filter: /^@venizia\/ignis-boot\/auto$/ }, () => ({ path: AUTO_SOURCE }));
  },
};

/** A fresh copy of the app and its workspace dependency, linked like a monorepo. */
const stage = (opts: { name: string; app: string }): string => {
  const root = join(workspace, opts.name);
  cpSync(join(FIXTURES, opts.app), join(root, 'app'), { recursive: true });
  cpSync(join(FIXTURES, 'groups', 'core'), join(root, 'core'), { recursive: true });
  mkdirSync(join(root, 'app', 'node_modules', '@fixture'), { recursive: true });
  symlinkSync(join(root, 'core'), join(root, 'app', 'node_modules', '@fixture', 'core'));
  return join(root, 'app');
};

const compile = async (opts: { app: string; plugins: BunPlugin[] }) =>
  Bun.build({
    entrypoints: [join(opts.app, 'src', 'index.ts')],
    compile: { outfile: join(opts.app, 'bin', 'app') },
    minify: true,
    plugins: opts.plugins,
    throw: false,
  });

describe('a compiled binary', () => {
  test('carries the app\x27s own classes and each borrowed group, with the source deleted', async () => {
    const app = stage({ name: 'with-plugin', app: join('compile', 'app') });
    const result = await compile({
      app,
      plugins: [frameworkSources, IgnisArtifactsPlugin.create({ root: join(app, 'src') })],
    });
    expect(result.success).toBe(true);

    rmSync(join(app, 'src'), { recursive: true });
    rmSync(join(app, '..', 'core', 'src'), { recursive: true });
    const run = Bun.spawnSync([join(app, 'bin', 'app')], { cwd: tmpdir() });

    expect(run.stdout.toString()).toContain(
      'own=OwnService inventory=StockRepository,StockService',
    );
  }, 60_000);

  test('fails to build when the plugin is missing, instead of shipping without classes', async () => {
    const app = stage({ name: 'without-plugin', app: join('compile', 'app') });
    const result = await compile({ app, plugins: [frameworkSources] });

    expect(result.success).toBe(false);
    expect(result.logs.map(log => log.message).join('\n')).toContain('ignis:artifacts');
  }, 60_000);

  test('an app that never imports the auto module builds and runs with no plugin', async () => {
    const app = stage({ name: 'plain', app: join('compile', 'plain') });
    const result = await compile({ app, plugins: [frameworkSources] });
    expect(result.success).toBe(true);

    const run = Bun.spawnSync([join(app, 'bin', 'app')], { cwd: tmpdir() });
    expect(run.stdout.toString()).toContain('plain=PlainService');
  }, 60_000);
});
