import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { BaseHelper, EnvironmentNames, LogLevels, MessageCode } from '@venizia/ignis-helpers/core';
import { HTTP, toJsonSafe } from '@venizia/ignis-helpers/common';
import type { IProvider } from '@venizia/ignis-inversion';
import type { Context } from 'hono';
import type { ErrorHandler, HTTPResponseError } from 'hono/types';
import { REQUEST_ID_KEY } from '../common';
import { isDatabaseClientError, isRetryableDatabaseError } from './database.handler';
import {
  ApplicationErrorTypes,
  DATABASE_RETRYABLE_ERROR_CODE,
  DATABASE_RETRYABLE_ERROR_MESSAGE,
} from './definition';
import type { IResolvedApplicationError, TApplicationErrorType } from './types';
import { formatZodError } from './zod.handler';

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'Internal Server Error';

/** An intentional error's throw site is still worth naming; its caller chain is framework plumbing, so it gets a smaller budget than an unexpected one. */
const DEFAULT_INTENTIONAL_STACK_FRAMES = 5;
const DEFAULT_UNEXPECTED_STACK_FRAMES = 10;

/** How a thrown error is rendered into the log line. Must never throw - a throw inside the error handler turns a handled failure into an unhandled one. */
export type TErrorLogFormatter = (opts: {
  error: unknown;
  messageCode?: string;
  extra?: Record<string, unknown>;
  includeStack?: boolean;
  maxStackFrames?: number;
}) => string;

type TThrown = Error | HTTPResponseError;
type TDatabaseClientError = ReturnType<typeof isDatabaseClientError>;

/**
 * Renders a value into one log-safe fragment.
 *
 * Redaction is not optional here. This runs on `extra`, which is whatever a throw site chose to
 * attach - `getError({ extra: { apiKey } })` is a shape applications write - and in a Worker this
 * fragment lands in the browser console. `toJsonSafe` masks secret-shaped keys; a hand-rolled
 * `JSON.stringify` does not, and the server path has always redacted.
 *
 * The BigInt replacer stays: `toJsonSafe` leaves BigInt intact and `JSON.stringify` refuses it, so
 * without this a single BigInt would collapse the whole fragment to the marker below. Anything else
 * it refuses yields that marker rather than a throw - this is the last-resort error handler, where a
 * throw turns a handled failure into an unhandled one.
 */
const renderValue = (opts: { value: unknown }): string => {
  const { value } = opts;

  if (typeof value === 'string') {
    return value;
  }

  const safe = toJsonSafe({ value });

  try {
    return JSON.stringify(safe) ?? String(value);
  } catch {
    // A replacer is 6x the cost of plain stringify and deopts every key, so it is installed only
    // once BigInt has actually thrown - the case it exists for, and the rare one.
    try {
      const rendered = JSON.stringify(safe, (_key, entry: unknown) =>
        typeof entry === 'bigint' ? entry.toString() : entry,
      );

      return rendered ?? String(value);
    } catch {
      // Not a swallowed failure: this marker IS the report, and it lands in the log line the caller
      // is building.
      return '[unrenderable]';
    }
  }
};

/**
 * Hono `onError`: ZodError -> 422, DB client error -> 400, retryable conflict -> 409, `getError` ->
 * its own status, else 500. Browser-pure: the two reads that need a host - the ambient environment
 * name and the error formatter - are constructor OPTIONS, not methods to subclass.
 *
 * They were hooks once, and three subclasses existed to answer them and nothing else. A class seam
 * is also unreachable from application code, so the browser example had to fake the environment with
 * a Hono middleware assigning `context.env`. `@venizia/ignis`'s `AppErrorMiddleware` now just
 * supplies `process.env.NODE_ENV` and `ErrorPrettier` as options.
 */
export class BaseAppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
  private rootKey: TNullable<string>;
  private intentionalStackFrames: number;
  private unexpectedStackFrames: number;

  /**
   * How this host reads its ambient environment name, and the ONE option that says whether it has
   * one at all: absent means it does not (a browser), so an unresolved name is by design; present
   * but returning `undefined` means a host that should have one is misconfigured. Either way
   * {@link isProduction} fails closed.
   *
   * A function, not a string: `process.env.NODE_ENV` has to be read per request, since a test - and
   * a `--env-file` reload - can change it after the middleware is built.
   */
  private readonly environment?: () => string | undefined;

  /** Replaces {@link renderErrorForLog} - `@venizia/ignis` passes `ErrorPrettier`, which reaches `node:util` and so cannot live here. */
  private readonly formatErrorOverride?: TErrorLogFormatter;

  constructor(opts?: {
    logger?: ILogger;
    rootKey?: string;
    intentionalStackFrames?: number;
    unexpectedStackFrames?: number;
    environment?: () => string | undefined;
    formatError?: TErrorLogFormatter;
  }) {
    // `new.target`, not a literal: a subclass logs under its own name, so `@venizia/ignis`'s
    // `AppErrorMiddleware` keeps the scope it has always logged under.
    super({ scope: new.target.name });

    this.rootKey = opts?.rootKey;
    this.intentionalStackFrames = opts?.intentionalStackFrames ?? DEFAULT_INTENTIONAL_STACK_FRAMES;
    this.unexpectedStackFrames = opts?.unexpectedStackFrames ?? DEFAULT_UNEXPECTED_STACK_FRAMES;
    this.environment = opts?.environment;
    this.formatErrorOverride = opts?.formatError;

    if (opts?.logger) {
      this.logger = opts.logger;
    }
  }

  /** Renders a thrown error for the log, through the `formatError` option when one was given. */
  protected formatError(opts: {
    error: unknown;
    messageCode?: string;
    extra?: Record<string, unknown>;
    includeStack?: boolean;
    maxStackFrames?: number;
  }): string {
    return (this.formatErrorOverride ?? (o => this.renderErrorForLog(o)))(opts);
  }

  /**
   * The default log rendering: pure and deliberately small, so the whole middleware stays
   * browser-pure.
   *
   * Must never throw, cycles included: a throw inside the error handler turns a handled failure
   * into an unhandled one.
   */
  private renderErrorForLog(opts: {
    error: unknown;
    messageCode?: string;
    extra?: Record<string, unknown>;
    includeStack?: boolean;
    maxStackFrames?: number;
  }): string {
    const { error, messageCode, extra, includeStack = true, maxStackFrames } = opts;
    const thrown = error as Partial<Error> | null | undefined;
    const lines: Array<string> = [];

    if (typeof thrown?.name === 'string') {
      lines.push(`name: ${thrown.name}`);
    }

    lines.push(
      `message: ${typeof thrown?.message === 'string' ? thrown.message : renderValue({ value: error })}`,
    );

    if (messageCode) {
      lines.push(`code: ${messageCode}`);
    }

    if (extra && Object.keys(extra).length > 0) {
      lines.push(`extra: ${renderValue({ value: extra })}`);
    }

    if (includeStack && typeof thrown?.stack === 'string') {
      const frames = thrown.stack.split('\n').filter(line => line.trimStart().startsWith('at '));
      const capped = maxStackFrames === undefined ? frames : frames.slice(0, maxStackFrames);

      if (capped.length > 0) {
        lines.push(`stack:\n${capped.join('\n')}`);
      }
    }

    return lines.map(line => `- ${line}`).join('\n');
  }

  private withRootKey(payload: object) {
    return this.rootKey ? { [this.rootKey]: payload } : payload;
  }

  /** Fail-closed: an unset or unrecognized env is production. */
  private isProduction(opts: { context: Context; error: TThrown; requestId: string }): boolean {
    const { context, error, requestId } = opts;
    const env = [context.env?.NODE_ENV, this.environment?.()].find(Boolean);

    if (!env) {
      // Only a host that HAS an ambient environment can be misconfigured about it. In a browser the
      // absence is by design, and shouting it at error level on every request buries the error the
      // reader is actually looking at. Both paths still sanitize.
      if (this.environment) {
        this.logger.error(
          '[%s] INVALID ENV IDENTIFIER | env: %s | path: %s | method: %s | url: %s\n%s',
          requestId,
          env,
          context.req.path,
          context.req.method,
          context.req.url,
          this.formatError({ error }),
        );
      } else {
        this.logger.debug(
          '[%s] No ambient environment - sanitizing as production | path: %s | set NODE_ENV on the Hono env binding to opt out',
          requestId,
          context.req.path,
        );
      }

      return true;
    }

    return !EnvironmentNames.DEVELOPMENT_ENVS.has(env.toLowerCase());
  }

  private classify(opts: { error: TThrown; dbError: TDatabaseClientError }): TApplicationErrorType {
    const { error, dbError } = opts;

    if (dbError.isClientError) {
      return ApplicationErrorTypes.DATABASE_CLIENT;
    }

    if (isRetryableDatabaseError({ error })) {
      return ApplicationErrorTypes.DATABASE_RETRYABLE;
    }

    if ('statusCode' in error) {
      return ApplicationErrorTypes.INTENTIONAL;
    }

    return ApplicationErrorTypes.UNEXPECTED;
  }

  /** An ApplicationError's `normalized` is authoritative - a `transform` may have reworded `text`. */
  private build(opts: {
    error: TThrown;
    statusCode: number;
    message: string;
    type: TApplicationErrorType;
    messageCode?: string;
  }): IResolvedApplicationError {
    const { error, statusCode, message, type, messageCode } = opts;

    // Fallback for a FOREIGN error that sets its own code; an ApplicationError reports via `normalized`.
    const code =
      messageCode ??
      MessageCode.resolve('messageCode' in error ? (error.messageCode as string) : undefined);

    const normalized =
      'normalized' in error
        ? (error.normalized as IResolvedApplicationError['normalized'])
        : { text: message, code, args: {} };

    return { statusCode, message, normalized, type };
  }

  private resolve(opts: { error: TThrown; isProduction: boolean }): IResolvedApplicationError {
    const { error, isProduction } = opts;
    const dbError = isDatabaseClientError({ error, isProduction });
    const type = this.classify({ error, dbError });

    switch (type) {
      case ApplicationErrorTypes.DATABASE_CLIENT: {
        return this.build({
          error,
          type,
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          // The fallback is unreachable today; it keeps the driver's raw text from ever surfacing.
          message: dbError.message ?? DEFAULT_INTERNAL_ERROR_MESSAGE,
        });
      }

      case ApplicationErrorTypes.DATABASE_RETRYABLE: {
        return this.build({
          error,
          type,
          statusCode: HTTP.ResultCodes.RS_4.Conflict,
          message: DATABASE_RETRYABLE_ERROR_MESSAGE,
          messageCode: DATABASE_RETRYABLE_ERROR_CODE,
        });
      }

      case ApplicationErrorTypes.INTENTIONAL: {
        return this.build({
          error,
          type,
          statusCode: (error as Error & { statusCode: number }).statusCode,
          message: error.message,
        });
      }

      default: {
        return this.build({
          error,
          type: ApplicationErrorTypes.UNEXPECTED,
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          // Never leak a raw message - it may carry SQL, schema names or connection details.
          message: isProduction ? DEFAULT_INTERNAL_ERROR_MESSAGE : error.message,
        });
      }
    }
  }

  /** A throw site may set `logLevel` via `getError`; anything unset or malformed logs at `error`. */
  private resolveLogLevel(opts: { error: TThrown }): TLogLevel {
    const candidate = (opts.error as { logLevel?: unknown }).logLevel;

    if (typeof candidate === 'string' && LogLevels.isValid(candidate)) {
      return candidate as TLogLevel;
    }

    return LogLevels.ERROR;
  }

  /** The one place a thrown error reaches the log - called once the status is known, so it carries it. */
  private logError(opts: {
    error: TThrown;
    context: Context;
    requestId: string;
    statusCode: number;
    messageCode: string;
    type?: TApplicationErrorType;
  }) {
    const { error, context, requestId, statusCode, messageCode, type } = opts;

    this.logger.log(
      this.resolveLogLevel({ error }),
      '[%s] REQUEST ERROR | %s | %s %s\n%s',
      requestId,
      statusCode,
      context.req.method,
      context.req.url,
      this.formatError({
        error,
        // The default code means "no code" - logging it on every error would be a noise line.
        messageCode: messageCode === MessageCode.DEFAULT ? undefined : messageCode,
        extra: 'extra' in error ? (error.extra as Record<string, unknown>) : undefined,
        includeStack: true,
        // An intentional error still needs its throw site; it just does not need the caller chain behind it.
        maxStackFrames:
          type === ApplicationErrorTypes.UNEXPECTED
            ? this.unexpectedStackFrames
            : this.intentionalStackFrames,
      }),
    );
  }

  value(): ErrorHandler {
    return async (error, context) => {
      const requestId = context.get(REQUEST_ID_KEY);
      const isProduction = this.isProduction({ context, error, requestId });

      if (error.name === 'ZodError') {
        const rs = formatZodError({
          isProduction,
          requestId,
          url: context.req.url,
          path: context.req.path,
          error,
        });

        this.logError({
          error,
          context,
          requestId,
          statusCode: rs.statusCode,
          messageCode: rs.response.normalized.code,
        });

        return context.json(
          this.withRootKey(rs.response),
          rs.statusCode as Parameters<typeof context.json>[1],
        );
      }

      const { statusCode, message, normalized, type } = this.resolve({ error, isProduction });

      this.logError({ error, context, requestId, statusCode, messageCode: normalized.code, type });

      const rs = {
        message,
        statusCode,
        normalized,
        requestId,
        extra: 'extra' in error ? error?.extra : undefined,
        details: {
          url: context.req.url,
          path: context.req.path,
          stack: !isProduction ? error.stack : undefined,
          cause: !isProduction ? error.cause : undefined,
        },
      };

      return context.json(this.withRootKey(rs), statusCode as Parameters<typeof context.json>[1]);
    };
  }
}
