import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckCommand } from '../../cli/check';
import { findCatalogProblems } from '../../checks/catalog';

const SCRATCH = join(__dirname, '../../../../../.agents/local/tmp');
mkdirSync(SCRATCH, { recursive: true });
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A throwaway workspace: a root manifest and manifests at the given repository-relative paths. */
const workspace = (opts: { root: object; files: Record<string, object> }): string => {
  const root = mkdtempSync(join(SCRATCH, 'check-catalog-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify(opts.root));

  for (const [file, manifest] of Object.entries(opts.files)) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), JSON.stringify(manifest));
  }

  return root;
};

const CATALOG = {
  workspaces: { packages: ['packages/*'], catalog: { zod: '4.5.4', hono: '4.1.0' } },
};

describe('findCatalogProblems', () => {
  test('every catalogued dependency referenced as catalog: is clean and counted', async () => {
    const root = workspace({
      root: CATALOG,
      files: {
        'packages/a/package.json': { dependencies: { zod: 'catalog:' } },
        'packages/b/package.json': { devDependencies: { hono: 'catalog:' } },
      },
    });

    const result = await findCatalogProblems({ root });
    expect(result).toEqual({
      problems: [],
      entries: 2,
      referenced: 2,
      noCatalog: false,
    });
  });

  test('positive control: a hard-coded range for a catalogued dependency is a problem naming the pin', async () => {
    const root = workspace({
      root: CATALOG,
      files: {
        'packages/a/package.json': { dependencies: { zod: '^4.0.0', hono: 'catalog:' } },
      },
    });

    const { problems } = await findCatalogProblems({ root });

    expect(problems).toEqual([
      {
        file: 'packages/a/package.json',
        message:
          'dependencies.zod is "^4.0.0" but the catalog owns it - use "catalog:" (catalog pins 4.5.4)',
      },
    ]);
  });

  test('positive control: a peer range that uses catalog: is a problem, unless the file is a preset', async () => {
    const files = {
      'packages/a/package.json': {
        dependencies: { zod: 'catalog:' },
        peerDependencies: { hono: 'catalog:' },
      },
      'presets/lib/preset.json': {
        devDependencies: { hono: 'catalog:' },
        peerDependencies: { hono: 'catalog:' },
      },
    };
    const root = workspace({ root: CATALOG, files });

    const without = await findCatalogProblems({ root, globs: ['presets/*/preset.json'] });
    const withPreset = await findCatalogProblems({
      root,
      globs: ['presets/*/preset.json'],
      presetPrefix: 'presets/',
    });

    expect(without.problems.map((problem) => problem.file)).toEqual([
      'packages/a/package.json',
      'presets/lib/preset.json',
    ]);
    expect(withPreset.problems.map((problem) => problem.file)).toEqual(['packages/a/package.json']);
  });

  test('positive control: a catalog entry nobody references is dead weight', async () => {
    const root = workspace({
      root: CATALOG,
      files: { 'packages/a/package.json': { dependencies: { zod: 'catalog:' } } },
    });

    const { problems } = await findCatalogProblems({ root });

    expect(problems).toEqual([
      {
        file: 'package.json',
        message: 'catalog entry "hono" is referenced by no workspace - drop it',
      },
    ]);
  });

  test('extra globs are read, and a glob repeated by the caller is read once', async () => {
    const root = workspace({
      root: CATALOG,
      files: {
        'packages/a/package.json': { dependencies: { zod: 'catalog:' } },
        'examples/e/package.json': { dependencies: { hono: '^4' } },
      },
    });

    const { problems } = await findCatalogProblems({
      root,
      globs: ['examples/*/package.json', 'packages/*/package.json'],
    });

    expect(problems.map((problem) => problem.file)).toEqual(['examples/e/package.json']);
  });

  test('a pinned manifest must equal the catalog version, not catalog:', async () => {
    const root = workspace({
      root: CATALOG,
      files: {
        'packages/a/package.json': { dependencies: { zod: 'catalog:' } },
        'docs/wiki/package.json': { dependencies: { hono: '4.0.0' } },
      },
    });

    const wrong = await findCatalogProblems({ root, pinned: ['docs/wiki/package.json'] });
    expect(wrong.problems[0].message).toContain('the catalog pins "4.1.0"');

    writeFileSync(
      join(root, 'docs/wiki/package.json'),
      JSON.stringify({ dependencies: { hono: '4.1.0' } }),
    );
    const result = await findCatalogProblems({ root, pinned: ['docs/wiki/package.json'] });
    expect(
      result.problems,
    ).toEqual([]);
  });

  test('a pinned manifest that does not exist is skipped', async () => {
    const root = workspace({
      root: CATALOG,
      files: {
        'packages/a/package.json': { dependencies: { zod: 'catalog:', hono: 'catalog:' } },
      },
    });

    const result = await findCatalogProblems({ root, pinned: ['docs/wiki/package.json'] });
    expect(
      result.problems,
    ).toEqual([]);
  });

  test('invalid JSON in a manifest is a problem, not a crash', async () => {
    const root = workspace({ root: CATALOG, files: {} });
    mkdirSync(join(root, 'packages/broken'), { recursive: true });
    writeFileSync(join(root, 'packages/broken/package.json'), '{ nope');

    const { problems } = await findCatalogProblems({ root });

    expect(problems[0].file).toBe('packages/broken/package.json');
    expect(problems[0].message).toStartWith('invalid JSON - ');
  });

  test('no workspaces.catalog is reported as such', async () => {
    const root = workspace({ root: { name: 'x' }, files: {} });

    const result = await findCatalogProblems({ root });
    expect(result.noCatalog).toBe(true);
  });
});

describe('devz check catalog', () => {
  test('exit codes: 0 clean, 1 with problems, 2 on a bad option', async () => {
    const clean = workspace({
      root: CATALOG,
      files: { 'packages/a/package.json': { dependencies: { zod: 'catalog:', hono: 'catalog:' } } },
    });
    const dirty = workspace({
      root: CATALOG,
      files: { 'packages/a/package.json': { dependencies: { zod: '1.0.0', hono: 'catalog:' } } },
    });

    const result = await CheckCommand.run({ root: clean, args: ['catalog'] });
    expect(result).toBe(0);
    const result2 = await CheckCommand.run({ root: dirty, args: ['catalog'] });
    expect(result2).toBe(1);
    const result3 = await CheckCommand.run({ root: clean, args: ['catalog', '--nope', 'x'] });
    expect(result3).toBe(2);
    const result4 = await CheckCommand.run({ root: clean, args: ['catalog', 'stray'] });
    expect(result4).toBe(2);
  });
});

describe('devz check module-cycles and split-report', () => {
  test('module-cycles: 2 without a folder or with a bad --max, 0 for a folder without cycles', async () => {
    const dir = mkdtempSync(join(SCRATCH, 'cycles-'));
    roots.push(dir);
    writeFileSync(join(dir, 'a.js'), 'export const a = 1;\n');

    const result = await CheckCommand.run({ root: dir, args: ['module-cycles'] });
    expect(result).toBe(2);
    const result2 = await CheckCommand.run({ root: dir, args: ['module-cycles', dir, '--max', 'x'] });
    expect(result2).toBe(
      2,
    );
    const result3 = await CheckCommand.run({ root: dir, args: ['module-cycles', '--dist', dir] });
    expect(result3).toBe(0);
  });

  test('module-cycles: exits 1 when the cycles exceed --max', async () => {
    const dir = mkdtempSync(join(SCRATCH, 'cycles-'));
    roots.push(dir);
    writeFileSync(join(dir, 'a.js'), "import './b.js';\n");
    writeFileSync(join(dir, 'b.js'), "import './a.js';\n");

    const result = await CheckCommand.run({ root: dir, args: ['module-cycles', dir] });
    expect(result).toBe(0);
    const result2 = await CheckCommand.run({ root: dir, args: ['module-cycles', dir, '--max', '0'] });
    expect(result2).toBe(
      1,
    );
    const result3 = await CheckCommand.run({ root: dir, args: ['module-cycles', dir, '--max', '1'] });
    expect(result3).toBe(
      0,
    );
  });

  test('split-report: an unknown option is a usage error, and a folder without src/ prints nothing', async () => {
    const dir = mkdtempSync(join(SCRATCH, 'split-'));
    roots.push(dir);

    const result = await CheckCommand.run({ root: dir, args: ['split-report', '--nope', 'x'] });
    expect(result).toBe(2);
    const result2 = await CheckCommand.run({ root: dir, args: ['split-report', dir] });
    expect(result2).toBe(0);
  });
});
