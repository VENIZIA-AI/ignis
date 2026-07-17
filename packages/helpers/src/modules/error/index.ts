/**
 * The error layer itself lives in `@venizia/ignis-inversion`, not here.
 *
 * It moved there so a browser application - which already depends on inversion for its DI, and
 * cannot depend on helpers - raises and reads errors through the SAME class the server does.
 * Before, inversion carried a second, divergent `ApplicationError` whose `messageCode` was never
 * resolved. Backend code keeps importing from `@venizia/ignis-helpers` and sees no difference.
 *
 * Re-exported by name rather than `export *`: inversion's barrel also carries the DI container, and
 * a blanket re-export would drag `Container`, `inject` and the rest into the helpers surface.
 *
 * Key registration works through this re-export: `declare module '@venizia/ignis-helpers'` merges
 * into `IErrorKeyRegistry` exactly as augmenting inversion directly would, because merging follows
 * the re-exported declaration. Augment whichever module the file already imports - TypeScript only
 * treats `declare module` as an augmentation when the target is imported, and silently downgrades
 * it to an inert ambient declaration otherwise. See `registry-augmentation.test.ts`.
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
