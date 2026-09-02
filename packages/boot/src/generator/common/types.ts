/** Mirrors the kernel's `ArtifactTypes` values; boot must not depend on kernel (`{boot, kernel} -> core` in the build chain). */
export type TArtifactType =
  'component' | 'controller' | 'service' | 'repository' | 'datasource' | 'model';

export interface IScannedArtifact {
  className: string;
  /** Absolute path of the declaring file. */
  filePath: string;
  type: TArtifactType;
}

export interface IScanOptions {
  root: string;
  /** Glob patterns relative to `root`; defaults to `ArtifactStereotypes.DEFAULT_IGNORE`. */
  ignore?: string[];
}
