import { ModuleUtility } from '@/utilities/module.utility';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A peer that ships both builds, like `bullmq` and `socket.io-client`: its exports map sends `import` to an ES
 * module and `require` to a CommonJS one, so a consumer's `import` and a `require` of the same name hold two
 * different instances. The fixture lives under a throwaway project root, never in this repository's node_modules.
 */
const buildProjectRoot = (opts: { name: string }): string => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-dual-package-'));
  const packageDirectory = join(root, 'node_modules', opts.name);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, 'package.json'),
    JSON.stringify({
      name: opts.name,
      version: '1.0.0',
      exports: { '.': { import: './esm.mjs', require: './cjs.cjs' } },
    }),
  );
  writeFileSync(join(packageDirectory, 'esm.mjs'), "export const flavour = 'esm';\n");
  writeFileSync(join(packageDirectory, 'cjs.cjs'), "exports.flavour = 'cjs';\n");
  return root;
};

describe('ModuleUtility - a peer that ships an ES module and a CommonJS build', () => {
  const roots: string[] = [];
  let counter = 0;
  // The registry is process-wide and has no way to forget a module, so each test installs its own name.
  let name = '';

  const useRoot = (): string => {
    counter += 1;
    name = `dual-peer-probe-${counter}`;
    const root = buildProjectRoot({ name });
    roots.push(root);
    ModuleUtility.setProjectRoot({ projectRoot: root });
    return root;
  };

  afterEach(() => {
    ModuleUtility.setProjectRoot({ projectRoot: process.cwd() });
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('loadSync returns the CommonJS copy (the hazard, kept as it is: a constructor cannot await)', () => {
    useRoot();

    expect(ModuleUtility.loadSync<{ flavour: string }>({ module: name }).flavour).toBe('cjs');
  });

  test('load resolves through the project root with the import condition: the ES module copy a consumer gets', async () => {
    useRoot();

    expect((await ModuleUtility.load<{ flavour: string }>({ module: name })).flavour).toBe('esm');
  });

  test('preload registers the ES module copy, so the synchronous path returns it afterwards', async () => {
    useRoot();

    await ModuleUtility.preload({ modules: [name] });

    expect(ModuleUtility.loadSync<{ flavour: string }>({ module: name }).flavour).toBe('esm');
  });

  test('preload keeps a module the application already registered', async () => {
    useRoot();
    const handedOver = { flavour: 'handed-over' };
    ModuleUtility.register({ modules: { [name]: handedOver } });

    await ModuleUtility.preload({ modules: [name] });

    expect(ModuleUtility.loadSync({ module: name })).toBe(handedOver);
  });

  test('preload of a module that is not installed throws the actionable error and registers nothing', async () => {
    useRoot();

    const error = await ModuleUtility.preload({
      modules: [name, '@definitely/not-installed'],
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain("Please install '@definitely/not-installed'");
    expect(ModuleUtility.loadSync<{ flavour: string }>({ module: name }).flavour).toBe('cjs');
  });

  test('load falls back to a plain import when the project root has no such peer (an installed module still loads)', async () => {
    useRoot();

    const dayjs = await ModuleUtility.load<{ default: (input?: string) => unknown }>({
      module: 'dayjs',
    });

    expect(typeof dayjs.default).toBe('function');
  });
});
