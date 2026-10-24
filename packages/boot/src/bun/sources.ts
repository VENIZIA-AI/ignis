import { getError } from '@venizia/ignis-helpers';
import { existsSync } from 'node:fs';
import { dirname, join, matchesGlob, relative, resolve, sep } from 'node:path';
import { ArtifactStereotypes, type IScannedArtifact } from '../generator/common';
import { ArtifactScanCache } from './scan-cache';

interface IArtifactScanner {
  scanWithReport(opts: { root: string; followReexports: boolean }): {
    artifacts: IScannedArtifact[];
  };
}

/** Where a package's artifacts live: the `src` beside its nearest `package.json`, and the classes under one of its directories. One scan per package per process, served from `ArtifactScanCache` when no source file changed - so this module never loads the scanner (and TypeScript) itself. */
export class ArtifactSources {
  private static readonly scans = new Map<string, IScannedArtifact[]>();
  private static scanner: IArtifactScanner | undefined;

  /** Called by the modules that already hold the scanner (the build plugin). */
  static useScanner(opts: { scanner: IArtifactScanner }): void {
    ArtifactSources.scanner = opts.scanner;
  }

  /** Loads the scanner - only on a cache miss. A non-static specifier, so a bundle never pulls TypeScript in. */
  static async loadScanner(): Promise<void> {
    if (ArtifactSources.scanner) {
      return;
    }
    const generatorModule = '../generator';
    const { ArtifactScanner } = await import(generatorModule);
    ArtifactSources.scanner = ArtifactScanner.getInstance();
  }

  /** Whether `packageSource` can be listed without the scanner: scanned in this process, or a valid disk cache. */
  static isCached(opts: { packageSource: string }): boolean {
    if (ArtifactSources.scans.has(opts.packageSource)) {
      return true;
    }
    const cached = ArtifactScanCache.read({ root: opts.packageSource });
    if (cached) {
      ArtifactSources.scans.set(opts.packageSource, cached);
    }
    return cached !== undefined;
  }

  /** Every decorated class under `packageSource`: this process's scan, else the disk cache, else the scanner (which must be loaded), written back to the cache. */
  static scan(opts: { packageSource: string }): IScannedArtifact[] {
    const { packageSource } = opts;
    if (ArtifactSources.isCached({ packageSource })) {
      return ArtifactSources.scans.get(packageSource) ?? [];
    }
    if (!ArtifactSources.scanner) {
      throw getError({
        message: `[ArtifactSources] ${packageSource} is not cached and the scanner is not loaded | Call ArtifactSources.loadScanner() first`,
      });
    }
    const { artifacts } = ArtifactSources.scanner.scanWithReport({
      root: packageSource,
      followReexports: true,
    });
    ArtifactSources.scans.set(packageSource, artifacts);
    ArtifactScanCache.write({ root: packageSource, artifacts });
    return artifacts;
  }

  /** The entry module (`Bun.main`), or `undefined` when there is no entry file (`bun -e`, a REPL). */
  static entry(): string | undefined {
    return typeof Bun !== 'undefined' && existsSync(Bun.main) ? Bun.main : undefined;
  }

  /** The `src` beside the nearest `package.json` at or above `from` (default: the working directory). */
  static packageSource(opts: { from?: string } = {}): string {
    const start = resolve(opts.from ?? process.cwd());
    let directory = start;
    while (!existsSync(join(directory, 'package.json'))) {
      const parent = dirname(directory);
      if (parent === directory) {
        return join(start, 'src');
      }
      directory = parent;
    }
    return join(directory, 'src');
  }

  /** The decorated classes under a directory named `folder` in the package whose source holds `site`, less those under an `ignore` glob (relative to `src`), each pointing at the copy that runs beside `site` (see `runningArtifacts`). */
  static folderArtifacts(opts: {
    folder: string | undefined;
    site: string;
    ignore?: ReadonlyArray<string>;
  }): IScannedArtifact[] {
    const packageSource = ArtifactSources.packageSource({ from: dirname(opts.site) });

    const artifacts = ArtifactSources.scan({ packageSource });

    const { folder } = opts;
    const ignored = opts.ignore ?? [];
    const picked = artifacts.filter((artifact) => {
      const path = relative(packageSource, artifact.filePath);
      return (
        (folder === undefined || path.split(sep).slice(0, -1).includes(folder)) &&
        !ignored.some((pattern) => matchesGlob(path, pattern))
      );
    });
    return ArtifactSources.runningArtifacts({ artifacts: picked, from: opts.site });
  }

  /** The scanned classes as the code at `from` runs them: unchanged when `from` is in `src`; otherwise each `src/<path>.ts` becomes `<tree>/<path>.js` in the compiled tree `from` sits in (`dist`, `dist/esm`), so an application registers the very class its code uses, never a second copy loaded from `src`. */
  static runningArtifacts(opts: {
    artifacts: IScannedArtifact[];
    from: string;
  }): IScannedArtifact[] {
    const from = resolve(opts.from);
    const packageSource = ArtifactSources.packageSource({ from: dirname(from) });
    const [probe] = opts.artifacts;
    if (!probe || from.startsWith(`${packageSource}${sep}`)) {
      return opts.artifacts;
    }

    const packageRoot = dirname(packageSource);
    const compiledPath = (target: { tree: string; artifact: IScannedArtifact }): string =>
      join(
        target.tree,
        relative(packageSource, target.artifact.filePath).replace(
          ArtifactStereotypes.SOURCE_EXTENSION,
          '.js',
        ),
      );
    const segments = relative(packageRoot, dirname(from)).split(sep);
    const tree = segments
      .map((_segment, index) => join(packageRoot, ...segments.slice(0, index + 1)))
      .find((candidate) => existsSync(compiledPath({ tree: candidate, artifact: probe })));

    return opts.artifacts.map((artifact) => {
      const compiled = tree ? compiledPath({ tree, artifact }) : undefined;
      if (!compiled || !existsSync(compiled)) {
        throw getError({
          message: `[ArtifactSources] ${artifact.filePath} has no compiled copy beside ${from} | The package runs from a compiled tree that is older than its src - rebuild it (or run it from src)`,
        });
      }
      return { ...artifact, filePath: compiled };
    });
  }

  /** Forgets every cached scan - for a long-lived process that rebuilds (a watch mode). */
  static clear(): void {
    ArtifactSources.scans.clear();
  }
}
