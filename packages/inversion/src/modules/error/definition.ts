import type { TConstValue } from '@/common/types';

export class ErrorScopes {
  static readonly AUTH = 'auth';
  static readonly VALIDATION = 'validation';
  static readonly BUSINESS = 'business';
  static readonly SYSTEM = 'system';
  static readonly INTEGRATION = 'integration';
}

export type TErrorScope = TConstValue<typeof ErrorScopes>;

export type TErrorDefinition = {
  /** Dot-notated i18n key, the machine-readable identity of this failure. */
  key: string;
  statusCode: number;
  message: string;
  messageArgs?: Record<string, unknown>;
  category?: TErrorScope;
  description?: string;
};

/**
 * Augmented per-package via declaration merging, driving `messageCode` autocomplete.
 *
 * When nothing augments it - the framework compiling on its own - {@link TErrorKey} falls back to
 * `string`, so a consumer that keeps no catalog is not forced to build one.
 */
export interface IErrorKeyRegistry {}

export type TErrorKey = [keyof IErrorKeyRegistry] extends [never]
  ? string
  : Extract<keyof IErrorKeyRegistry, string>;

/**
 * Registers a catalog's keys with {@link IErrorKeyRegistry}:
 *
 * ```ts
 * declare module '@venizia/ignis-helpers' {
 *   interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {}
 * }
 * ```
 *
 * The `extends Record<string, TErrorDefinition>` bound is load-bearing: without it TypeScript does
 * not know every value of `T` carries a `key`, and `T[keyof T]['key']` fails to compile. It costs
 * nothing in precision - `T` is still the type of an `as const` catalog, so the indexed access
 * yields the union of literal keys rather than `string`.
 */
export type TRegisterErrors<T extends Record<string, TErrorDefinition>> = Record<
  T[keyof T]['key'],
  true
>;
