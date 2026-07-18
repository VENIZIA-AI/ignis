/**
 * Error layer lives in `@venizia/ignis-inversion` so browser apps (DI-only, no helpers) share the same class.
 * Re-exported by NAME, not `export *`, to keep inversion's DI container off the helpers surface.
 * Augment `IErrorKeyRegistry` via whichever module the file imports - see `registry-augmentation.test.ts`.
 */
export {
  ApplicationError,
  ErrorScopes,
  getError,
  isApplicationError,
  MessageCode,
} from '@venizia/ignis-inversion';

export type {
  IErrorKeyRegistry,
  TError,
  TErrorByDefinition,
  TErrorByField,
  TErrorDefinition,
  TErrorDefinitionMessage,
  TErrorKey,
  TErrorMessage,
  TErrorMessageInput,
  TErrorMessageOverride,
  TErrorNormalized,
  TErrorNormalizeTransformFn,
  TErrorScope,
  TRegisterErrors,
} from '@venizia/ignis-inversion';

export * from './types';
