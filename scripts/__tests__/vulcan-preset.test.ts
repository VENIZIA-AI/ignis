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
    path: 'presets/ignis/preset.json',
    value: opts.template ?? {
      presetVersion: 1,
      dependencies: { '@venizia/a': 'workspace:*', hono: 'catalog:', winston: '^3.19.0' },
      devDependencies: { hono: 'catalog:' },
      files: './files',
    },
  });
  writeText({
    root,
    path: 'presets/ignis/files/_env.example',
    content: 'PORT={{devPort}}\n',
  });
  writeText({
    root,
    path: 'presets/ignis/files/.configs/lint.mts',
    content: 'export default {};\n',
  });

  return { root, outDir: join(root, 'out') };
};

const readPreset = (opts: { outDir: string }): Record<string, unknown> =>
  JSON.parse(readFileSync(join(opts.outDir, 'preset.json'), 'utf8'));

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

    expect(readFileSync(join(repository.outDir, 'files/_env.example'), 'utf8')).toBe(
      'PORT={{devPort}}\n',
    );
    expect(existsSync(join(repository.outDir, 'files/.configs/lint.mts'))).toBe(true);
    expect(readPreset(repository).files).toBe('./files');
    expect(written).toContain('files/.configs/lint.mts');
    expect(written).toContain('preset.json');
  });

  test('the output folder is replaced, not merged', () => {
    const repository = makeRepository({});

    buildPreset(repository);
    writeText({ root: repository.outDir, path: 'files/stale.txt', content: 'old' });
    buildPreset(repository);

    expect(existsSync(join(repository.outDir, 'files/stale.txt'))).toBe(false);
  });
});
