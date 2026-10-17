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

  /** The decorated classes under a directory named `folder` in the package whose source holds `site`. A site outside that source (a `dist` copy) is refused: its classes would be a second identity of the ones the package runs. */
  static folderArtifacts(opts: { folder: string; site: string }): IScannedArtifact[] {
    const packageSource = ArtifactSources.packageSource({ from: dirname(opts.site) });
    if (!resolve(opts.site).startsWith(`${packageSource}${sep}`)) {
      throw getError({
        message: `[ArtifactGroup] '${opts.folder}' is defined at ${opts.site}, outside the package source ${packageSource} | A package consumed through dist must ship its groups filled by its own build (IgnisArtifactsPlugin), or be consumed from source`,
      });
    }

    let artifacts = ArtifactSources.scans.get(packageSource);
    if (!artifacts) {
      artifacts = ArtifactScanner.getInstance().scanWithReport({
        root: packageSource,
        followReexports: true,
      }).artifacts;
      ArtifactSources.scans.set(packageSource, artifacts);
    }

    return artifacts.filter(artifact =>
      relative(packageSource, artifact.filePath).split(sep).slice(0, -1).includes(opts.folder),
    );
  }

  /** Forgets every cached scan - for a long-lived process that rebuilds (a watch mode). */
  static clear(): void {
    ArtifactSources.scans.clear();
  }
}
