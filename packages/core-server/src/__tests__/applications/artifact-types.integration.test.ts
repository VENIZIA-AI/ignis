// ArtifactTypes.define across the kernel and boot: a class of a type the application defined is found by the scanner,
// reaches the index, and is bound once with the definition's scope - from source, from a generated index and from a build.
import { IgnisArtifactsPlugin } from '@venizia/ignis-boot/bun';
import { ArtifactIndexGenerator } from '@venizia/ignis-boot/generator';
import { ArtifactTypes, BindingScopes, RestApplication } from '@venizia/ignis-kernel';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'applications', 'fixtures', 'emitter-app');
const SOURCE = join(APP, 'src');
const workspace = mkdtempSync(join(tmpdir(), 'ignis-emitter-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** What `src/main.ts` of the fixture prints after it registers the application's artifacts. */
const resultOf = (opts: { command: string[]; cwd: string }) => {
  const run = Bun.spawnSync(opts.command, { cwd: opts.cwd });
  const line = run.stdout
    .toString()
    .split('\n')
    .find((entry) => entry.startsWith('RESULT '));

  expect(run.exitCode, run.stderr.toString()).toBe(0);
  expect(line).toBeDefined();

  return JSON.parse((line ?? '').slice('RESULT '.length));
};

const EXPECTED = { bound: ['emitters.OrderEmitter'], isSingleton: true, isInjected: true };

describe('an application type, end to end', () => {
  test('from source: the auto index finds the class, binds it once as a singleton, and target resolves it', () => {
    expect(resultOf({ command: ['bun', 'run', 'src/main.ts'], cwd: APP })).toEqual(EXPECTED);
  }, 60_000);

  test('from a build: the plugin carries the class, and the bundle binds it once as a singleton', async () => {
    const outdir = join(workspace, 'bundle');
    mkdirSync(outdir, { recursive: true });
    const result = await Bun.build({
      entrypoints: [join(SOURCE, 'main.ts')],
      outdir,
      target: 'bun',
      plugins: [IgnisArtifactsPlugin.create({ root: SOURCE })],
      throw: false,
    });

    expect(result.success, result.logs.map((log) => log.message).join('\n')).toBe(true);
    expect(resultOf({ command: ['bun', 'run', join(outdir, 'main.js')], cwd: workspace })).toEqual(
      EXPECTED,
    );
  }, 120_000);

  test('from a generated index: the custom field lists the class, and registerArtifacts binds it', async () => {
    const out = join(workspace, 'generated', 'artifacts.ts');
    const { content } = ArtifactIndexGenerator.generate({ root: SOURCE, out });

    expect(content).toContain('  custom: {\n    emitter: [OrderEmitter],\n  },');

    const { GeneratedArtifacts } = await import(out);
    class GeneratedApplication extends RestApplication {
      getAppInfo() {
        return { name: 'generated-app', version: '0.0.0', description: '' };
      }

      preConfigure(): void {}
      postConfigure(): void {}
      staticConfigure(): void {}
      setupMiddlewares(): void {}
    }
    const application = new GeneratedApplication({
      scope: GeneratedApplication.name,
      config: { path: { base: '/', isStrict: false } },
    });
    application.init();
    await application.registerArtifacts(GeneratedArtifacts);

    const bindings = application.findByTag({ tag: 'emitters' });
    const [binding] = bindings;

    expect(bindings).toHaveLength(1);
    expect(String(binding.key)).toBe('emitters.OrderEmitter');
    expect(ArtifactTypes.definitionOf({ type: 'emitter' })).toMatchObject({
      scope: BindingScopes.SINGLETON,
    });
    expect(binding.getScope()).toBe(BindingScopes.SINGLETON);
  });
});
