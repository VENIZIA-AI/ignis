import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * A published package must not ship a JavaScript sourcemap that points at a file the tarball lacks:
 * Vite and other bundlers warn "points to missing source files" for each one. Every .js.map under
 * `dist` must carry `sourcesContent` for each source, or name sources the package publishes.
 *
 * Declaration maps are the opposite case and must exist: atlas and editors map a .d.ts position back
 * to its source file and line through them, and no bundler loads them. tsc cannot embed sources in a
 * .d.ts.map, so they point at the repository src on purpose. The checks read the build output as it
 * is; they build nothing.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

type TSourceMap = { sources?: string[]; sourcesContent?: (string | null)[] };

type TPackageManifest = { files?: string[] };

const MAP_SUFFIXES = ['.js.map'];

const walkMaps = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkMaps(full);
    }
    return MAP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix)) ? [full] : [];
  });

/** Whether `files` publishes `relPath`: under a listed entry, and not matched by a `!` pattern. */
const isPublished = (opts: { files: string[]; relPath: string }): boolean => {
  const { files, relPath } = opts;
  const included = files
    .filter((entry) => !entry.startsWith('!'))
    .some((entry) => relPath === entry || relPath.startsWith(`${entry}/`));
  if (!included) {
    return false;
  }
  return !files
    .filter((entry) => entry.startsWith('!'))
    .some((entry) => new Bun.Glob(entry.slice(1).replace(/^\//, '')).match(relPath));
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
  .map((name) => join(PACKAGES_DIR, name))
  .filter((dir) => existsSync(join(dir, 'dist')) && existsSync(join(dir, 'package.json')));

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
        (mapFile) => findUnresolvable({ packageDir, files, mapFile }).length > 0,
      );

      const sample = broken.slice(0, 3).map((mapFile) => relative(packageDir, mapFile));
      expect(
        broken.length,
        `${broken.length} maps point at sources the package does not publish, e.g. ${sample.join(', ')}`,
      ).toBe(0);
    });
  }
});

const countFiles = (opts: { dir: string; suffix: string }): number =>
  readdirSync(opts.dir, { withFileTypes: true }).reduce((total, entry) => {
    const full = join(opts.dir, entry.name);
    if (entry.isDirectory()) {
      return total + countFiles({ dir: full, suffix: opts.suffix });
    }
    return total + (entry.name.endsWith(opts.suffix) ? 1 : 0);
  }, 0);

describe('declaration maps are emitted', () => {
  for (const packageDir of packageDirs) {
    test(relative(REPO_ROOT, packageDir), () => {
      const dist = join(packageDir, 'dist');
      const declarations = countFiles({ dir: dist, suffix: '.d.ts' });
      const maps = countFiles({ dir: dist, suffix: '.d.ts.map' });

      expect(
        maps,
        `${declarations} .d.ts files but ${maps} .d.ts.map - atlas loses source lines`,
      ).toBe(declarations);
    });
  }
});
