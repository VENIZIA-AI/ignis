import type { TErrorScope } from './definition';

/**
 * The RESOLVED message a client renders: `translate(code, args)`. Every field is always present -
 * the constructor defaults `code` to {@link MessageCode.DEFAULT} and `args` to `{}` - so no consumer
 * has to null-check what it reads.
 */
export type TErrorNormalized = {
  text: string;
  code: string;
  args: Record<string, unknown>;
};

/**
 * The message a CALLER supplies. Only `text` is required; the rest is what {@link TErrorNormalized}
 * resolves. Every other message shape below is derived from this one.
 */
export type TErrorMessageInput = {
  text: string;
  code?: TErrorKey | (string & Record<never, never>);
  args?: Record<string, unknown>;
};

/**
 * A catalogued message - a `code` is the whole reason the catalog exists, so it is required here.
 *
 * `code` is a plain `string`, NOT {@link TErrorKey}: a catalog DECLARES the keys the registry is
 * built from, so typing it against that registry would make `IErrorKeyRegistry` define itself.
 */
export type TErrorDefinitionMessage = Omit<TErrorMessageInput, 'code'> & { code: string };

/** The free-form input: a bare string is the historical shape. */
export type TErrorMessage = string | TErrorMessageInput;

/** The catalogued form's override - every field optional, since the definition supplies the rest. */
export type TErrorMessageOverride = string | Partial<TErrorMessageInput>;

export type TErrorDefinition = {
  message: TErrorDefinitionMessage;
  statusCode: number;
  category?: TErrorScope;
  description?: string;
};

/** Augmented per-package via declaration merging, driving `messageCode` autocomplete. */
export interface IErrorKeyRegistry {}

export type TErrorKey = [keyof IErrorKeyRegistry] extends [never]
  ? string
  : Extract<keyof IErrorKeyRegistry, string>;

/** Builds {@link TErrorNormalized} in place of the default; `message` is the default it replaces. */
export type TErrorNormalizeTransformFn = (opts: {
  message: TErrorNormalized;
  statusCode: number;
  extra?: Record<string, unknown>;
}) => TErrorNormalized;

/**
 * Shared by both input forms. Unknown keys ride the index signature into `extra`, so a throw site
 * can attach context the framework does not model - and so does a mistyped one.
 */
type TErrorCommon = {
  statusCode?: number;
  messageArgs?: Record<string, unknown>;
  cause?: unknown;
  extra?: Record<string, unknown>;
  transform?: TErrorNormalizeTransformFn;
};

/**
 * Catalogued form. `message` and `statusCode` override the definition's defaults; the object form is
 * partial, so `{ message: { args } }` amends the args and keeps the definition's text and code.
 */
export type TErrorByDefinition = TErrorCommon & {
  error: TErrorDefinition;
  message?: TErrorMessageOverride;
  [key: string]: unknown;
};

/**
 * Free-form: an invariant, a misconfiguration, a failure carrying no i18n code. `message` is the
 * only required field - most throw sites legitimately fall back to `MessageCode.DEFAULT`.
 */
export type TErrorByField = TErrorCommon & {
  message: TErrorMessage;
  messageCode?: TErrorKey | (string & Record<never, never>);
  /**
   * Never valid here - `error` is the catalogued form's discriminant. Without this the index
   * signature accepts `{ message, error: caughtError }`, a natural way to write "wrap this", and
   * `error` is a CONSUMED key: the wrapped failure would vanish. Use `cause`.
   */
  error?: never;
  [key: string]: unknown;
};

export type TError = TErrorByDefinition | TErrorByField;

/**
 * Registers a catalog's keys with {@link IErrorKeyRegistry}:
 *
 * ```ts
 * declare module '@venizia/ignis-helpers' {
 *   interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {}
 * }
 * ```
 */
export type TRegisterErrors<T extends Record<string, TErrorDefinition>> = Record<
  T[keyof T]['message']['code'],
  true
>;
