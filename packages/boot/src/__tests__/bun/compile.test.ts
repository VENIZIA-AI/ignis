import { IgnisArtifactsPlugin } from '@/bun';
import type { BunPlugin } from 'bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  test('importing the auto module loads no class until artifacts are resolved', async () => {
    const app = stage({ name: 'lazy-auto', app: join('compile', 'app') });
    writeFileSync(
      join(app, 'src', 'loud.service.ts'),
      "import { service } from '@venizia/ignis-kernel';\nconsole.log('evaluated');\n@service()\nexport class LoudService {}\n",
    );
    writeFileSync(
      join(app, 'src', 'lazy.ts'),
      "import auto from '@venizia/ignis-boot/auto';\nconsole.log('imported');\nawait auto.resolve();\nconsole.log('resolved');\n",
    );
    const result = await Bun.build({
      entrypoints: [join(app, 'src', 'lazy.ts')],
      compile: { outfile: join(app, 'bin', 'lazy') },
      plugins: [frameworkSources, IgnisArtifactsPlugin.create({ root: join(app, 'src') })],
      throw: false,
    });
    expect(result.success).toBe(true);

    const output = Bun.spawnSync([join(app, 'bin', 'lazy')], { cwd: tmpdir() }).stdout.toString();
    expect(output.split('\n').filter(Boolean)).toEqual(['imported', 'evaluated', 'resolved']);
  });

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

  test('keeps the source name of a registered class that subclasses a same-name base', async () => {
    const app = stage({ name: 'same-name', app: join('compile', 'app') });
    // A plain base and the registered subclass share a name: the subclass's module scope would shadow the base, so Bun renames it to StockService2.
    // Legacy decorators, as every IGNIS application compiles.
    writeFileSync(
      join(app, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
        },
      }),
    );
    mkdirSync(join(app, 'src', 'base'), { recursive: true });
    writeFileSync(join(app, 'src', 'base', 'stock.ts'), 'export class StockService {}\n');
    writeFileSync(
      join(app, 'src', 'services', 'stock.service.ts'),
      "import { service } from '@venizia/ignis-kernel';\nimport { StockService as BaseStockService } from '../base/stock';\n@service()\nexport class StockService extends BaseStockService {}\n",
    );
    // Unminified, as the binary guide asks.
    const result = await Bun.build({
      entrypoints: [join(app, 'src', 'index.ts')],
      compile: { outfile: join(app, 'bin', 'app') },
      plugins: [frameworkSources, IgnisArtifactsPlugin.create({ root: join(app, 'src') })],
      throw: false,
    });
    expect(result.success).toBe(true);

    const run = Bun.spawnSync([join(app, 'bin', 'app')], { cwd: tmpdir() });
    // Anchored: StockService2 contains StockService.
    expect(run.stdout.toString()).toMatch(/own=OwnService,StockService inventory=/);
  }, 60_000);

  test('fails to build when the plugin is missing, instead of shipping without classes', async () => {
    const app = stage({ name: 'without-plugin', app: join('compile', 'app') });
    const result = await compile({ app, plugins: [frameworkSources] });

    expect(result.success).toBe(false);
    expect(result.logs.map((log) => log.message).join('\n')).toContain('ignis:artifacts');
  }, 60_000);

  test('an app that never imports the auto module builds and runs with no plugin', async () => {
    const app = stage({ name: 'plain', app: join('compile', 'plain') });
    const result = await compile({ app, plugins: [frameworkSources] });
    expect(result.success).toBe(true);

    const run = Bun.spawnSync([join(app, 'bin', 'app')], { cwd: tmpdir() });
    expect(run.stdout.toString()).toContain('plain=PlainService');
  }, 60_000);

  test('a browser bundle imports the auto index eagerly (tree-shaken), and lazyIndex opts back in', async () => {
    const app = stage({ name: 'browser-eager', app: join('compile', 'app') });
    writeFileSync(
      join(app, 'src', 'loud.service.ts'),
      "import { service } from '@venizia/ignis-kernel';\nconsole.log('evaluated');\n@service()\nexport class LoudService {}\n",
    );
    writeFileSync(
      join(app, 'src', 'lazy.ts'),
      "import auto from '@venizia/ignis-boot/auto';\nconsole.log('imported');\nawait auto.resolve();\nconsole.log('resolved');\n",
    );
    const order = async (opts: { lazyIndex?: boolean; out: string }): Promise<string[]> => {
      const result = await Bun.build({
        entrypoints: [join(app, 'src', 'lazy.ts')],
        target: 'browser',
        outdir: join(app, opts.out),
        plugins: [
          frameworkSources,
          IgnisArtifactsPlugin.create({ root: join(app, 'src'), lazyIndex: opts.lazyIndex }),
        ],
        throw: false,
      });
      expect(result.success).toBe(true);
      return Bun.spawnSync(['bun', join(app, opts.out, 'lazy.js')], { cwd: tmpdir() })
        .stdout.toString()
        .split('\n')
        .filter(Boolean);
    };
    const result2 = await order({ out: 'out-default' });
    expect(result2).toEqual(['evaluated', 'imported', 'resolved']);
    const result3 = await order({ lazyIndex: true, out: 'out-lazy' });
    expect(result3).toEqual([
      'imported',
      'evaluated',
      'resolved',
    ]);
  }, 60_000);

  test('a browser bundle of an app using the auto module builds with the plugin', async () => {
    const app = stage({ name: 'browser', app: join('compile', 'app') });
    const result = await Bun.build({
      entrypoints: [join(app, 'src', 'index.ts')],
      target: 'browser',
      outdir: join(app, 'out'),
      plugins: [frameworkSources, IgnisArtifactsPlugin.create({ root: join(app, 'src') })],
      throw: false,
    });

    expect(result.logs.map((log) => log.message).join('\n')).not.toContain('node:');
    expect(result.success).toBe(true);
  }, 60_000);
});
