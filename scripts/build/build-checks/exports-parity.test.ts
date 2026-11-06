import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ExportsParity } from './exports-parity';

/**
 * For every entry in each package's `exports`, the values the declaration file exports are the keys of the
 * built module (#924). A declaration with no export behind it type-checks and then reads `undefined` in a
 * consumer that does not typecheck, which is how 0.4.8-2 shipped `PostgresErrorCodes` (#913). A name a
 * barrel re-exports with `export type` is not a value and is left out. Reads the build; builds nothing.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const FIXTURES = join(import.meta.dir, 'fixtures', 'exports-parity');

type TCondition = string | Record<string, unknown>;

type TEntry = { subpath: string; types: string; runtime: string };

/** The entries of a package that publish both a declaration and a module: `exports` rows with `types` and `import` or `default`. */
const readEntries = (opts: { packageDir: string }): TEntry[] => {
  const manifest: { exports?: Record<string, TCondition> } = JSON.parse(
    readFileSync(join(opts.packageDir, 'package.json'), 'utf8'),
  );

  return Object.entries(manifest.exports ?? {}).flatMap(([subpath, condition]) => {
    if (typeof condition !== 'object' || condition === null) {
      return [];
    }

    const { types, import: importTarget, default: defaultTarget } = condition;
    const runtime = typeof importTarget === 'string' ? importTarget : defaultTarget;

    return typeof types === 'string' && typeof runtime === 'string'
      ? [{ subpath, types, runtime }]
      : [];
  });
};

const compareEntry = async (opts: { dts: string; file: string }) => {
  return ExportsParity.diff({
    typed: ExportsParity.typedValues({ dts: opts.dts }),
    runtime: await ExportsParity.load({ file: opts.file }),
  });
};

const packageDirs = readdirSync(PACKAGES_DIR)
  .map((name) => join(PACKAGES_DIR, name))
  .filter((dir) => existsSync(join(dir, 'dist')) && existsSync(join(dir, 'package.json')));

/**
 * The entries each package contributes, as a floor. A package with fewer means the gate lost rows (the reader of
 * `exports` broke), not that the package shrank; a package that really drops an entry lowers its number here.
 * Per package, never a total over all of them: the release workflow builds one package per job, and a total only
 * exists when every package is built. A built package that is not listed must still contribute at least one.
 */
const MIN_ENTRIES: Record<string, number> = {
  '@venizia/dev-configs': 7,
  '@venizia/ignis': 7,
  '@venizia/ignis-boot': 6,
  '@venizia/ignis-connectors': 17,
  '@venizia/ignis-filter': 2,
  '@venizia/ignis-helpers': 17,
  '@venizia/ignis-inversion': 1,
  '@venizia/ignis-kernel': 3,
  '@venizia/ignis-worker': 1,
};

const readPackageName = (opts: { packageDir: string }): string => {
  const manifest: { name: string } = JSON.parse(
    readFileSync(join(opts.packageDir, 'package.json'), 'utf8'),
  );

  return manifest.name;
};

describe('every value typed in an entry point exists at runtime', () => {
  test('at least one built package is present', () => {
    expect(packageDirs.length).toBeGreaterThan(0);
  });

  for (const packageDir of packageDirs) {
    test(`${relative(REPO_ROOT, packageDir)} contributes at least its floor of entries`, () => {
      const name = readPackageName({ packageDir });
      const count = readEntries({ packageDir }).length;

      expect(count, `${name} contributes ${count} entries`).toBeGreaterThanOrEqual(
        MIN_ENTRIES[name] ?? 1,
      );
    });
  }

  for (const packageDir of packageDirs) {
    describe(relative(REPO_ROOT, packageDir), () => {
      for (const { subpath, types, runtime } of readEntries({ packageDir })) {
        test(subpath, async () => {
          const { missing, extra } = await compareEntry({
            dts: join(packageDir, types),
            file: join(packageDir, runtime),
          });

          expect(
            missing,
            `typed in ${types} but not exported by ${runtime}: ${missing.join(', ')}`,
          ).toEqual([]);
          expect(
            extra,
            `exported by ${runtime} but not typed in ${types}: ${extra.join(', ')}`,
          ).toEqual([]);
        });
      }
    });
  }
});

describe('the parity check itself', () => {
  test('positive control: a value typed but absent at runtime is reported', async () => {
    const { missing } = await compareEntry({
      dts: join(FIXTURES, 'typed-but-missing.d.ts'),
      file: join(FIXTURES, 'typed-but-missing.js'),
    });

    expect(missing).toEqual(['AlsoMissing', 'missingAtRuntime']);
  });

  test('positive control: a typed value that exists as a key but holds undefined is reported', async () => {
    const { missing } = await compareEntry({
      dts: join(FIXTURES, 'undefined-value.d.ts'),
      file: join(FIXTURES, 'undefined-value.js'),
    });

    expect(missing).toEqual(['hollow', 'hollowToo']);
  });

  test('positive control: a typed default that is missing at runtime is reported', async () => {
    const { missing } = await compareEntry({
      dts: join(FIXTURES, 'typed-default.d.ts'),
      file: join(FIXTURES, 'typed-default.js'),
    });

    expect(missing).toEqual(['default']);
  });

  test('positive control: a runtime export with no declaration is reported', async () => {
    const { extra } = await compareEntry({
      dts: join(FIXTURES, 'untyped-extra.d.ts'),
      file: join(FIXTURES, 'untyped-extra.js'),
    });

    expect(extra).toEqual(['hidden']);
  });

  test('positive control: a name re-exported with `export type` is not a value, so its absence is not reported', async () => {
    const typed = ExportsParity.typedValues({ dts: join(FIXTURES, 'type-only-barrel.d.ts') });

    expect(typed).toEqual(['ownValue']);
  });

  test('interfaces and type aliases are not values', async () => {
    const { missing, extra } = await compareEntry({
      dts: join(FIXTURES, 'matching.d.ts'),
      file: join(FIXTURES, 'matching.js'),
    });

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});
