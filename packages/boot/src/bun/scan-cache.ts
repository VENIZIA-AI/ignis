import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { ArtifactStereotypes, type IScannedArtifact } from '../generator/common';

/** The scanner's answer for one `src`, kept under the package's `node_modules/.cache` and valid while no `.ts` file under `src`, the package manifest or the lockfile changed - a hit skips TypeScript entirely. */
export class ArtifactScanCache {
  static readonly VERSION = 2;

  static location(opts: { root: string }): string {
    const root = resolve(opts.root);
    const key = createHash('sha1').update(root).digest('hex').slice(0, 16);
    return join(dirname(root), 'node_modules', '.cache', 'ignis-artifacts', `${key}.json`);
  }

  /** Path, size and mtime of every `.ts`/`.tsx` under `root`, plus the package manifest and the nearest lockfile (a dependency upgrade can change which decorators count). */
  static fingerprint(opts: { root: string }): string {
    const root = resolve(opts.root);
    const entries: string[] = [];
    for (const relativePath of globSync(ArtifactStereotypes.SOURCE_GLOB, { cwd: root })) {
      const stats = statSync(join(root, relativePath));
      entries.push(`${relativePath}:${stats.size}:${stats.mtimeMs}`);
    }
    entries.sort();

    const extras = [join(dirname(root), 'package.json')];
    let directory = dirname(root);
    while (true) {
      const lockfile = ['bun.lock', 'bun.lockb', 'package-lock.json']
        .map(name => join(directory, name))
        .find(existsSync);
      if (lockfile) {
        extras.push(lockfile);
        break;
      }
      const parent = dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
    for (const file of extras.filter(existsSync)) {
      const stats = statSync(file);
      entries.push(`${file}:${stats.size}:${stats.mtimeMs}`);
    }

    return createHash('sha1')
      .update(`${ArtifactScanCache.VERSION}\n${entries.join('\n')}`)
      .digest('hex');
  }

  /** The cached scan, or `undefined` for a missing, stale or unreadable cache - never an error. */
  static read(opts: { root: string }): IScannedArtifact[] | undefined {
    const file = ArtifactScanCache.location(opts);
    if (!existsSync(file)) {
      return undefined;
    }
    let stored: { fingerprint?: unknown; artifacts?: unknown };
    try {
      stored = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // A corrupt cache is a miss: the caller scans and rewrites it.
      return undefined;
    }
    if (
      stored.fingerprint !== ArtifactScanCache.fingerprint(opts) ||
      !Array.isArray(stored.artifacts)
    ) {
      return undefined;
    }
    return stored.artifacts;
  }

  /** Stores a scan; `false` when the cache directory cannot be written (a read-only install), which only costs the next start a scan. */
  static write(opts: { root: string; artifacts: IScannedArtifact[] }): boolean {
    const file = ArtifactScanCache.location(opts);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        temporary,
        JSON.stringify({
          fingerprint: ArtifactScanCache.fingerprint(opts),
          artifacts: opts.artifacts,
        }),
      );
      renameSync(temporary, file);
      return true;
    } catch {
      // Caching is an optimisation; reporting `false` lets the caller go on with the scan it already has.
      return false;
    }
  }
}
