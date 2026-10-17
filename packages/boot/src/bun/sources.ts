import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ArtifactScanner, type IScannedArtifact } from '../generator';

/** Where a package's artifacts live: the `src` beside its nearest `package.json`, and the classes under one of its directories. */
export class ArtifactSources {
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

  /** The decorated classes under a directory named `folder` in the package whose source holds `site`. */
  static folderArtifacts(opts: { folder: string; site: string }): IScannedArtifact[] {
    const packageSource = ArtifactSources.packageSource({ from: dirname(opts.site) });
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: packageSource,
      followReexports: true,
    });

    return artifacts.filter(artifact =>
      relative(packageSource, artifact.filePath).split(sep).slice(0, -1).includes(opts.folder),
    );
  }
}
