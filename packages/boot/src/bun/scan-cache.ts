import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ArtifactStereotypes, type IScannedArtifact } from '../generator/common';

/** The scanner's answer for one `src`, kept under the package's `node_modules/.cache` and valid while no `.ts` file under `src`, the package manifest or the lockfile changed - a hit skips TypeScript entirely. */
export class ArtifactScanCache {
  static readonly VERSION = 2;

  /**
   * A 128-bit hash of `text` as 32 hex characters (cyrb128: four 32-bit lanes, public domain). It names a cache file and
   * tells a changed tree from an unchanged one; nothing here is a secret, so it needs no cryptographic strength. It is
   * plain arithmetic on purpose: this file runs under Vite, which runs under Node, where `Bun` and `node:crypto`
   * (removed from the sources) are not available, and under Bun alike. The same text gives the same string on both.
   */
  static digest(opts: { text: string }): string {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;

    for (let index = 0; index < opts.text.length; index++) {
      const code = opts.text.charCodeAt(index);
      h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
    }

    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;

    return [h1, h2, h3, h4].map((lane) => (lane >>> 0).toString(16).padStart(8, '0')).join('');
  }

  static location(opts: { root: string }): string {
    const root = resolve(opts.root);
    const key = ArtifactScanCache.digest({ text: root }).slice(0, 16);
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
        .map((name) => join(directory, name))
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

    return ArtifactScanCache.digest({
      text: `${ArtifactScanCache.VERSION}\n${entries.join('\n')}`,
    });
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
      // eslint-disable-next-line venizia/no-silent-catch -- a corrupt cache is a miss; the cause is not reported and the only cost is one fresh scan
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
      // eslint-disable-next-line venizia/no-silent-catch -- the `false` returned below is the report; the cause of the failed write is lost and the next start pays one scan
    } catch {
      // Caching is an optimisation; reporting `false` lets the caller go on with the scan it already has.
      return false;
    }
  }
}
