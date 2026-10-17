import { getError } from '@venizia/ignis-helpers';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ArtifactScanner, type IScannedArtifact } from '../generator';

/** Where a package's artifacts live: the `src` beside its nearest `package.json`, and the classes under one of its directories. One scan per package per process. */
export class ArtifactSources {
  private static readonly scans = new Map<string, IScannedArtifact[]>();

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

  /** The decorated classes under a directory named `folder` in the package whose source holds `site`, each pointing at the copy that runs beside `site` (see `runningArtifacts`). */
  static folderArtifacts(opts: { folder: string | undefined; site: string }): IScannedArtifact[] {
    const packageSource = ArtifactSources.packageSource({ from: dirname(opts.site) });

    let artifacts = ArtifactSources.scans.get(packageSource);
    if (!artifacts) {
      artifacts = ArtifactScanner.getInstance().scanWithReport({
        root: packageSource,
        followReexports: true,
      }).artifacts;
      ArtifactSources.scans.set(packageSource, artifacts);
    }

    const { folder } = opts;
    const picked =
      folder === undefined
        ? artifacts
        : artifacts.filter(artifact =>
            relative(packageSource, artifact.filePath).split(sep).slice(0, -1).includes(folder),
          );
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
      join(target.tree, relative(packageSource, target.artifact.filePath).replace(/\.ts$/, '.js'));
    const segments = relative(packageRoot, dirname(from)).split(sep);
    const tree = segments
      .map((_segment, index) => join(packageRoot, ...segments.slice(0, index + 1)))
      .find(candidate => existsSync(compiledPath({ tree: candidate, artifact: probe })));

    return opts.artifacts.map(artifact => {
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
