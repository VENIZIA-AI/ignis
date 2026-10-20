// The module IgnisArtifactsPlugin serves: the application's index, rendered from the scanner.
declare module 'ignis:artifacts' {
  import type { TGeneratedArtifactIndex } from '../generator';

  export const GeneratedArtifacts: TGeneratedArtifactIndex;
}
