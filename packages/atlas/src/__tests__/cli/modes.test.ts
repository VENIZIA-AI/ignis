import { AtlasModes } from '@/common';
import { findPackageDirectory, ModeUsageError, readPackageVersion, resolveMode } from '@/cli/modes';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

const PACKAGE_MANIFEST = JSON.stringify({ name: '@venizia/ignis-atlas' });

const tempDirs: string[] = [];

const makeTempDir = (opts: { prefix: string }): string => {
  const dir = mkdtempSync(join(tmpdir(), opts.prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

/** A scratch directory laid out like a real checkout: `docs/wiki/content` and `.agents/knowledge`. */
const makeRepoRoot = (): string => {
  const root = makeTempDir({ prefix: 'atlas-modes-repo-' });
  mkdirSync(join(root, 'docs/wiki/content'), { recursive: true });
  mkdirSync(join(root, '.agents/knowledge'), { recursive: true });
  return root;
};

/** A scratch package directory with a real `package.json` naming this package. */
const makePackageDirectory = (opts: { withSnapshot: boolean }): string => {
  const packageDirectory = makeTempDir({ prefix: 'atlas-modes-pkg-' });
  writeFileSync(join(packageDirectory, 'package.json'), PACKAGE_MANIFEST);

  if (opts.withSnapshot) {
    mkdirSync(join(packageDirectory, 'dist/corpus'), { recursive: true });
  }

  return packageDirectory;
};

describe('resolveMode', () => {
  test('a repo-layout root resolves to repo mode with that root unchanged', () => {
    const root = makeRepoRoot();
    const packageDirectory = makePackageDirectory({ withSnapshot: false });

    expect(resolveMode({ root, packageDirectory })).toEqual({ mode: AtlasModes.REPO, root });
  });

  test('a package directory with a packaged snapshot resolves to snapshot mode', () => {
    const root = makeTempDir({ prefix: 'atlas-modes-empty-' });
    const packageDirectory = makePackageDirectory({ withSnapshot: true });

    expect(resolveMode({ root, packageDirectory })).toEqual({
      mode: AtlasModes.SNAPSHOT,
      root: join(packageDirectory, 'dist'),
    });
  });

  test('neither a repo checkout nor a packaged snapshot throws ModeUsageError', () => {
    const root = makeTempDir({ prefix: 'atlas-modes-empty-' });
    const packageDirectory = makePackageDirectory({ withSnapshot: false });

    expect(() => resolveMode({ root, packageDirectory })).toThrow(ModeUsageError);
  });
});

describe('findPackageDirectory', () => {
  test('finds the package directory from both a source-style and a dist-style start directory', () => {
    const packageDirectory = makePackageDirectory({ withSnapshot: false });
    const sourceStyleStart = join(packageDirectory, 'src');
    const distStyleStart = join(packageDirectory, 'dist/cjs');
    mkdirSync(sourceStyleStart, { recursive: true });
    mkdirSync(distStyleStart, { recursive: true });

    expect(findPackageDirectory({ startDirectory: sourceStyleStart })).toBe(packageDirectory);
    expect(findPackageDirectory({ startDirectory: distStyleStart })).toBe(packageDirectory);
  });

  test('finds the real packages/atlas directory from this test file location', () => {
    expect(findPackageDirectory({ startDirectory: __dirname })).toBe(join(__dirname, '../../..'));
  });

  test('throws when no ancestor package.json names this package', () => {
    const orphan = makeTempDir({ prefix: 'atlas-modes-orphan-' });
    expect(() => findPackageDirectory({ startDirectory: orphan })).toThrow();
  });
});

describe('readPackageVersion (I6)', () => {
  test('reads the version field from the located package.json', () => {
    const packageDirectory = makeTempDir({ prefix: 'atlas-modes-version-' });
    writeFileSync(
      join(packageDirectory, 'package.json'),
      JSON.stringify({ name: '@venizia/ignis-atlas', version: '9.9.9-test' }),
    );

    expect(readPackageVersion({ directory: packageDirectory })).toBe('9.9.9-test');
  });

  test('is undefined when the directory has no package.json', () => {
    const empty = makeTempDir({ prefix: 'atlas-modes-no-manifest-' });
    expect(readPackageVersion({ directory: empty })).toBeUndefined();
  });

  test('reads the real packages/atlas version from this test file location', () => {
    const packageDirectory = findPackageDirectory({ startDirectory: __dirname });
    expect(readPackageVersion({ directory: packageDirectory })).toMatch(/^\d+\.\d+\.\d+/);
  });
});
