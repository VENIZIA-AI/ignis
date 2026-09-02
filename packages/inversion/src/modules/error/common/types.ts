import type { TErrorScope } from '../definition';

/** Declared here, not imported from helpers' `TLogLevel` (browser-safe); a helpers guard pins them equal. */
export type TErrorLogLevel = 'error' | 'emerg' | 'warn' | 'info' | 'debug';

/** Resolved message a client renders. All fields always present - no null-checks downstream. */
export type TErrorNormalized = {
  text: string;
  code: string;
  args: Record<string, unknown>;
};

/** Wire payload as a CLIENT receives it - the input to {@link ApplicationError.fromError}. Every field is optional on purpose: a client parses what a gateway, a proxy or an older server actually sent. */
export type TResponsedError = {
  message?: string;
  statusCode?: number;
  normalized?: Partial<TErrorNormalized>;
  extra?: Record<string, unknown>;
  requestId?: string;
  details?: Record<string, unknown>;
};

/** The message a CALLER supplies - only `text` is required, the rest is what {@link TErrorNormalized} resolves; every other message shape is derived from this one. */
export type TErrorMessageInput = {
  text: string;
  code?: TErrorKey | (string & Record<never, never>);
  args?: Record<string, unknown>;
};

/** Catalogued message - `code` required, typed `string` and not {@link TErrorKey}: catalogs DECLARE the registry keys, so typing against the registry would be self-referential. */
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

/** Shared by both input forms - unknown keys ride the index signature into `extra`, so a throw site can attach context the framework does not model, and so does a mistyped key. */
type TErrorCommon = {
  statusCode?: number;
  messageArgs?: Record<string, unknown>;
  cause?: unknown;
  extra?: Record<string, unknown>;
  transform?: TErrorNormalizeTransformFn;
  logLevel?: TErrorLogLevel; // Default: error
};

/** Catalogued form - `message` and `statusCode` override the definition's defaults; the object form is partial, so `{ message: { args } }` amends the args and keeps the definition's text and code. */
export type TErrorByDefinition = TErrorCommon & {
  error: TErrorDefinition;
  message?: TErrorMessageOverride;
  [key: string]: unknown;
};

/** Free-form: an invariant, a misconfiguration, a failure carrying no i18n code. `message` is the only required field - most throw sites legitimately fall back to `MessageCode.DEFAULT`. */
export type TErrorByField = TErrorCommon & {
  message: TErrorMessage;
  messageCode?: TErrorKey | (string & Record<never, never>);
  /** Never valid here - `error` is the catalogued form's discriminant and a CONSUMED key, so a wrapped failure passed as `error` would vanish; use `cause`. */
  error?: never;
  [key: string]: unknown;
};

export type TError = TErrorByDefinition | TErrorByField;

/** Registers a catalog's keys with {@link IErrorKeyRegistry}, via `declare module '@venizia/ignis-helpers' { interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {} }`. */
export type TRegisterErrors<T extends Record<string, TErrorDefinition>> = Record<
  T[keyof T]['message']['code'],
  true
>;
