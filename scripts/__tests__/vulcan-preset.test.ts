import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPreset } from '../vulcan-preset';

const tmpDirs: string[] = [];

const writeText = (opts: { root: string; path: string; content: string }): void => {
  const full = join(opts.root, opts.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.content);
};

const writeJson = (opts: { root: string; path: string; value: unknown }): void =>
  writeText({ root: opts.root, path: opts.path, content: JSON.stringify(opts.value) });

/** A repository with one workspace package, `@venizia/a`, and a root catalog. */
const makeRepository = (opts: {
  version?: string;
  rootManifest?: Record<string, unknown>;
  template?: Record<string, unknown>;
}): { root: string; outDir: string } => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-vulcan-preset-'));
  tmpDirs.push(root);

  writeJson({
    root,
    path: 'package.json',
    value: opts.rootManifest ?? {
      workspaces: { packages: ['packages/*'], catalog: { hono: '^4.1.0' } },
    },
  });
  writeJson({
    root,
    path: 'packages/a/package.json',
    value: { name: '@venizia/a', version: opts.version ?? '1.2.3' },
  });
  writeJson({
    root,
    path: 'presets/app/preset.json',
    value: opts.template ?? {
      presetVersion: 1,
      dependencies: { '@venizia/a': 'workspace:*', hono: 'catalog:', winston: '^3.19.0' },
      devDependencies: { hono: 'catalog:' },
      files: './files',
    },
  });
  writeText({
    root,
    path: 'presets/app/files/_env.example',
    content: 'PORT={{devPort}}\n',
  });
  writeText({
    root,
    path: 'presets/app/files/.configs/lint.mts',
    content: 'export default {};\n',
  });

  return { root, outDir: join(root, 'out') };
};

/** A lib template beside the app one: a peer on the workspace package, a catalog devDependency. */
const writeLib = (opts: { root: string }): void => {
  writeJson({
    root: opts.root,
    path: 'presets/lib/preset.json',
    value: {
      presetVersion: 1,
      peerDependencies: { '@venizia/a': 'workspace:*' },
      devDependencies: { hono: 'catalog:' },
      files: './files',
    },
  });
  writeText({ root: opts.root, path: 'presets/lib/files/src/index.ts', content: 'export {};\n' });
};

const readOutput = (opts: { outDir: string; file: string }): Record<string, unknown> =>
  JSON.parse(readFileSync(join(opts.outDir, opts.file), 'utf8'));

const readPreset = (opts: { outDir: string }): Record<string, unknown> =>
  JSON.parse(readFileSync(join(opts.outDir, 'app/preset.json'), 'utf8'));

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('buildPreset', () => {
  test('workspace:* resolves to the version on disk at call time', () => {
    const repository = makeRepository({});

    buildPreset(repository);
    expect(readPreset(repository).dependencies).toMatchObject({ '@venizia/a': '1.2.3' });

    writeJson({
      root: repository.root,
      path: 'packages/a/package.json',
      value: { name: '@venizia/a', version: '1.2.4-0' },
    });
    buildPreset(repository);
    expect(readPreset(repository).dependencies).toMatchObject({ '@venizia/a': '1.2.4-0' });
  });

  test('catalog: resolves to the root catalog value', () => {
    const repository = makeRepository({});

    buildPreset(repository);

    expect(readPreset(repository).dependencies).toMatchObject({ hono: '^4.1.0' });
    expect(readPreset(repository).devDependencies).toEqual({ hono: '^4.1.0' });
  });

  test('catalog: also resolves from a top-level catalog and array workspaces', () => {
    const repository = makeRepository({
      rootManifest: { workspaces: ['packages/*'], catalog: { hono: '^4.2.0' } },
    });

    buildPreset(repository);

    expect(readPreset(repository).dependencies).toMatchObject({ hono: '^4.2.0' });
  });

  test('a catalog: name missing from the catalog throws and names it', () => {
    const repository = makeRepository({
      template: { presetVersion: 1, dependencies: { zod: 'catalog:' }, files: './files' },
    });

    expect(() => buildPreset(repository)).toThrow('zod');
  });

  test('a workspace:* name with no workspace package throws and names it', () => {
    const repository = makeRepository({
      template: {
        presetVersion: 1,
        dependencies: { '@venizia/ghost': 'workspace:*' },
        files: './files',
      },
    });

    expect(() => buildPreset(repository)).toThrow('@venizia/ghost');
  });

  test('literal ranges pass through unchanged', () => {
    const repository = makeRepository({});

    buildPreset(repository);

    expect(readPreset(repository).dependencies).toMatchObject({ winston: '^3.19.0' });
  });

  test('files/ is copied byte-identical with dotfile-named sources, and files points at ./files', () => {
    const repository = makeRepository({});

    const { written } = buildPreset(repository);

    expect(readFileSync(join(repository.outDir, 'app/files/_env.example'), 'utf8')).toBe(
      'PORT={{devPort}}\n',
    );
    expect(existsSync(join(repository.outDir, 'app/files/.configs/lint.mts'))).toBe(true);
    expect(readPreset(repository).files).toBe('./files');
    expect(written).toContain('app/files/.configs/lint.mts');
    expect(written).toContain('app/preset.json');
  });

  test('the output folder is replaced, not merged', () => {
    const repository = makeRepository({});

    buildPreset(repository);
    writeText({ root: repository.outDir, path: 'app/files/stale.txt', content: 'old' });
    buildPreset(repository);

    expect(existsSync(join(repository.outDir, 'app/files/stale.txt'))).toBe(false);
  });

  test('no presets/lib writes the app preset only', () => {
    const repository = makeRepository({});

    const { written } = buildPreset(repository);

    expect(existsSync(join(repository.outDir, 'lib'))).toBe(false);
    expect(written.some(path => path.startsWith('lib/'))).toBe(false);
  });

  test('the lib preset resolves its markers, peerDependencies included', () => {
    const repository = makeRepository({});
    writeLib({ root: repository.root });

    buildPreset(repository);
    const lib = readOutput({ outDir: repository.outDir, file: 'lib/preset.json' });

    expect(lib.peerDependencies).toEqual({ '@venizia/a': '1.2.3' });
    expect(lib.devDependencies).toEqual({ hono: '^4.1.0' });
    expect(lib.files).toBe('./files');
  });

  test('the lib gets the configs and the clean script of the app, not its other scripts, and its own files win', () => {
    const repository = makeRepository({});
    writeLib({ root: repository.root });
    writeText({
      root: repository.root,
      path: 'presets/app/files/scripts/clean.sh',
      content: 'app\n',
    });
    writeText({
      root: repository.root,
      path: 'presets/app/files/scripts/compile.sh',
      content: 'compile\n',
    });
    writeText({
      root: repository.root,
      path: 'presets/lib/files/.configs/lint.mts',
      content: 'lib\n',
    });

    const { written } = buildPreset(repository);
    const out = (path: string): string => readFileSync(join(repository.outDir, path), 'utf8');

    expect(out('lib/files/scripts/clean.sh')).toBe('app\n');
    expect(out('lib/files/.configs/lint.mts')).toBe('lib\n');
    expect(existsSync(join(repository.outDir, 'lib/files/scripts/compile.sh'))).toBe(false);
    expect(existsSync(join(repository.outDir, 'lib/files/_env.example'))).toBe(false);
    expect(written).toContain('lib/preset.json');
    expect(written).toContain('lib/files/src/index.ts');
  });
});
