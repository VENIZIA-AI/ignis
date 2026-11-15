import type { TClass } from '@venizia/ignis-helpers';
import type { TArtifactIndexField, TArtifactType, TScanSkipReason } from './constants';

/** A decorated class the scanner put in the index. */
export interface IScannedArtifact {
  className: string;
  /** Absolute path of the declaring file. */
  filePath: string;
  type: TArtifactType;
}

/** Options for one scan of a source tree. */
export interface IScanOptions {
  root: string;
  /**
   * Glob patterns relative to `root`, ignored in addition to `ArtifactStereotypes.DEFAULT_IGNORE`,
   * which always apply.
   *
   * @default []
   */
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

/**
 * What an application may hand to an `AutoArtifactGroup` as its index: a list of classes per kind, with the same kinds as the kernel's `IArtifactIndex` (boot does not depend on the kernel, so it cannot name that type). The classes are `TClass<unknown>` so any real class is accepted; the group keeps the exact type the application passed.
 */
export type TGeneratedArtifactIndexInput = Partial<
  Record<TArtifactIndexField, ReadonlyArray<TClass<unknown>>>
>;

/**
 * The index boot builds and moves around without knowing the application's classes: the object a generated index exports, and the default of `AutoArtifactGroup`.
 *
 * Each kind of the kernel's index names its own class type (`TClass<BaseConfiguration>`, `TClass<IService>`, ...), which boot cannot name. `TClass<never>` is the bottom of that family: it is assignable to every one of them, so a group that carries it is still the kernel's `IArtifactGroup`. Its instance type is `never`, so boot only passes the classes along and never constructs one.
 */
export type TGeneratedArtifactIndex = Partial<
  Record<TArtifactIndexField, ReadonlyArray<TClass<never>>>
>;
