import type { TErrorDefinition, TErrorKey } from './definition';

/** The client-facing message: `translate(normalized.code, normalized.args)`. */
export type TErrorNormalized = {
  text: string;
  code: string;
  args: Record<string, unknown>;
};

/**
 * Builds {@link TErrorNormalized} in place of the default. Receives a flat snapshot, never the
 * half-built instance. Its `text` may differ from `message`: `message` is what the throw site
 * wrote, `text` is what a client shows.
 */
export type TErrorNormalizeTransformFn = (opts: {
  message: string;
  messageCode: string;
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
  /** The wrapped failure. Reaches the native `Error.cause`. */
  cause?: unknown;
  /** Explicit context. Merges with whatever the index signature swept in. */
  extra?: Record<string, unknown>;
  transform?: TErrorNormalizeTransformFn;
};

/** Catalogued form. `message` and `statusCode` override the definition's defaults. */
export type TErrorByDefinition = TErrorCommon & {
  error: TErrorDefinition;
  message?: string;
  [key: string]: unknown;
};

/**
 * Free-form: an invariant, a misconfiguration, a failure carrying no i18n code. `message` is the
 * only required field - most throw sites legitimately fall back to `MessageCode.DEFAULT`.
 */
export type TErrorByField = TErrorCommon & {
  message: string;
  messageCode?: TErrorKey | (string & Record<never, never>);
  [key: string]: unknown;
};

export type TError = TErrorByDefinition | TErrorByField;
