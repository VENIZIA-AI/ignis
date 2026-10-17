import type { TGeneratedArtifactIndex } from '../generator';
import { AutoArtifactsLoader } from './auto-loader';

/** The application's own decorated classes, found by the scanner - pass it in `configs.artifacts`. From source the run-time plugin builds it; in a `Bun.build` binary the `IgnisArtifactsPlugin` replaces this module with the built index. */
const AutoArtifacts: Promise<TGeneratedArtifactIndex> = AutoArtifactsLoader.load();

export default AutoArtifacts;
