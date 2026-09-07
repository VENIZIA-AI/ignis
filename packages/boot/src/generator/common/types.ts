import type { TArtifactType } from './constants';

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

/** The index content plus what a caller's `ignore` silently left out: decorated classes under a user pattern, never under a default one. */
export interface IScanReport {
  artifacts: IScannedArtifact[];
  ignored: IScannedArtifact[];
}
