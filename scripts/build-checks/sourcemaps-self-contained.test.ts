import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * A published package must not ship a sourcemap that points at a file the tarball lacks: Vite and
 * other tools warn "points to missing source files" for each one. Every map under `dist` must either
 * carry `sourcesContent` for each source, or name sources the package's `files` field publishes.
 * The check reads the build output as it is; it builds nothing.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

type TSourceMap = { sources?: string[]; sourcesContent?: (string | null)[] };

type TPackageManifest = { files?: string[] };

const MAP_SUFFIXES = ['.js.map', '.d.ts.map'];

const walkMaps = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkMaps(full);
    }
    return MAP_SUFFIXES.some(suffix => entry.name.endsWith(suffix)) ? [full] : [];
  });

/** Whether `files` publishes `relPath`: under a listed entry, and not matched by a `!` pattern. */
const isPublished = (opts: { files: string[]; relPath: string }): boolean => {
  const { files, relPath } = opts;
  const included = files
    .filter(entry => !entry.startsWith('!'))
    .some(entry => relPath === entry || relPath.startsWith(`${entry}/`));
  if (!included) {
    return false;
  }
  return !files
    .filter(entry => entry.startsWith('!'))
    .some(entry => new Bun.Glob(entry.slice(1).replace(/^\//, '')).match(relPath));
};

/** The sources of `mapFile` that a consumer cannot resolve: not embedded and not published. */
const findUnresolvable = (opts: { packageDir: string; files: string[]; mapFile: string }) => {
  const { packageDir, files, mapFile } = opts;
  const map: TSourceMap = JSON.parse(readFileSync(mapFile, 'utf8'));
  const sources = map.sources ?? [];

  return sources.filter((source, index) => {
    if (typeof map.sourcesContent?.[index] === 'string') {
      return false;
    }
    const relPath = relative(packageDir, resolve(dirname(mapFile), source));
    return !isPublished({ files, relPath });
  });
};

const packageDirs = readdirSync(PACKAGES_DIR)
  .map(name => join(PACKAGES_DIR, name))
  .filter(dir => existsSync(join(dir, 'dist')) && existsSync(join(dir, 'package.json')));

describe('published sourcemaps are self-contained', () => {
  test('at least one built package is present', () => {
    expect(packageDirs.length).toBeGreaterThan(0);
  });

  for (const packageDir of packageDirs) {
    test(relative(REPO_ROOT, packageDir), () => {
      const manifest: TPackageManifest = JSON.parse(
        readFileSync(join(packageDir, 'package.json'), 'utf8'),
      );
      const files = manifest.files ?? [];

      const broken = walkMaps(join(packageDir, 'dist')).filter(
        mapFile => findUnresolvable({ packageDir, files, mapFile }).length > 0,
      );

      const sample = broken.slice(0, 3).map(mapFile => relative(packageDir, mapFile));
      expect(
        broken.length,
        `${broken.length} maps point at sources the package does not publish, e.g. ${sample.join(', ')}`,
      ).toBe(0);
    });
  }
});
