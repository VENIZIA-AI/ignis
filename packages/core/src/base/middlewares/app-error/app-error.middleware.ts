import type { ILogger, TLogLevel, TNullable } from '@venizia/ignis-helpers';
import {
  BaseHelper,
  Environment,
  ErrorPrettier,
  HTTP,
  LogLevels,
  MessageCode,
} from '@venizia/ignis-helpers';
import type { IProvider } from '@venizia/ignis-inversion';
import type { Context } from 'hono';
import type { ErrorHandler, HTTPResponseError } from 'hono/types';
import { RequestSpyMiddleware } from '../request-spy';
import { isDatabaseClientError, isRetryableDatabaseError } from './database.handler';
import {
  ApplicationErrorTypes,
  DATABASE_RETRYABLE_ERROR_CODE,
  DATABASE_RETRYABLE_ERROR_MESSAGE,
} from './definition';
import type { IResolvedApplicationError, TApplicationErrorType } from './types';
import { formatZodError } from './zod.handler';

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'Internal Server Error';

type TThrown = Error | HTTPResponseError;
type TDatabaseClientError = ReturnType<typeof isDatabaseClientError>;

/** Hono `onError`: ZodError -> 422, DB client error -> 400, retryable conflict -> 409, `getError` -> its own status, else 500. */
export class AppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
  private rootKey: TNullable<string>;

  constructor(opts?: { logger?: ILogger; rootKey?: string }) {
    super({ scope: AppErrorMiddleware.name });

    this.rootKey = opts?.rootKey;

    if (opts?.logger) {
      this.logger = opts.logger;
    }
  }

  private withRootKey(payload: object) {
    return this.rootKey ? { [this.rootKey]: payload } : payload;
  }

  /** Fail-closed: an unset or unrecognized env is production. */
  private isProduction(opts: { context: Context; error: TThrown; requestId: string }): boolean {
    const { context, error, requestId } = opts;
    const env = [context.env?.NODE_ENV, process.env.NODE_ENV].find(Boolean);

    if (!env) {
      this.logger.error(
        '[%s] INVALID ENV IDENTIFIER | env: %s | path: %s | method: %s | url: %s\n%s',
        requestId,
        env,
        context.req.path,
        context.req.method,
        context.req.url,
        ErrorPrettier.format({ error }),
      );

      return true;
    }

    return !Environment.DEVELOPMENT_ENVS.has(env.toLowerCase());
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
      ErrorPrettier.format({
        error,
        // The default code means "no code" - logging it on every error would be a noise line.
        messageCode: messageCode === MessageCode.DEFAULT ? undefined : messageCode,
        extra: 'extra' in error ? (error.extra as Record<string, unknown>) : undefined,
        // Only an unexpected failure needs frames; an intentional error's are framework plumbing.
        includeStack: type === ApplicationErrorTypes.UNEXPECTED,
      }),
    );
  }

  value(): ErrorHandler {
    return async (error, context) => {
      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
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
