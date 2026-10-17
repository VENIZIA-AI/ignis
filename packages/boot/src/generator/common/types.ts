import type { TArtifactType, TScanSkipReason } from './constants';

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
  /** Module specifiers, matched exactly, whose stereotype imports also count - a package that re-exports the decorators. Adds to `ArtifactStereotypes.SOURCE_MODULES`. */
  sourceModules?: string[];
  /** Recognise a stereotype imported from any module whose exports lead, through `export *` and renaming re-exports, to a source module - a framework that re-exports the kernel's decorators. */
  followReexports?: boolean;
}

/** A decorated class the index leaves out, and why. */
export interface IScanSkipped {
  className: string;
  filePath: string;
  reason: TScanSkipReason;
}

/** The index content plus what a caller's `ignore` silently left out: decorated classes under a user pattern, never under a default one. */
export interface IScanReport {
  artifacts: IScannedArtifact[];
  ignored: IScannedArtifact[];
  /** Every decorated class left out - abstract, not a named export, or under a user ignore pattern. */
  skipped: IScanSkipped[];
}
