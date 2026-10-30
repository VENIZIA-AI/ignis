import type { IScanReport, IScannedArtifact } from './common';
import { ArtifactIndexGenerator, type IGenerateOptions } from './generator';

/** @deprecated Use ArtifactIndexGenerator.generate({ root, out, ignore, exportName, sourceModules }). Removed in 0.5. */
export const generateArtifactIndex = (
  opts: IGenerateOptions,
): { content: string; written: boolean } & IScanReport => ArtifactIndexGenerator.generate(opts);

/** @deprecated Use ArtifactIndexGenerator.check({ root, out, ignore, exportName, sourceModules }). Removed in 0.5. */
export const checkArtifactIndex = (
  opts: IGenerateOptions,
): {
  isFresh: boolean;
  expected: string;
  actual: string | undefined;
  ignored: IScannedArtifact[];
} => ArtifactIndexGenerator.check(opts);

export * from './common';
export * from './emitter';
export * from './generator';
export * from './scanner';
