import type { Logger, TNullable } from '@venizia/ignis-helpers';
import { BaseHelper, Environment, HTTP, MessageCode } from '@venizia/ignis-helpers';
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

/**
 * Application error handler (Hono `onError`). Routes each error to the right shape:
 * - ZodError → 422 via {@link formatZodError}
 * - DB client error (class 22/23/44) → 400 via {@link isDatabaseClientError}
 * - Transient DB conflict (40001/40P01) → 409 via {@link isRetryableDatabaseError}
 * - Intentional domain error (`getError`) → its own status/message
 * - Anything else → 500 (generic message in production)
 */
export class AppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
  private rootKey: TNullable<string>;

  constructor(opts?: { logger?: Logger; rootKey?: string }) {
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
        '[%s] INVALID ENV IDENTIFIER | env: %s | path: %s | method: %s | url: %s | Error: %s',
        requestId,
        env,
        context.req.path,
        context.req.method,
        context.req.url,
        error,
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
    messageCode?: string;
  }): IResolvedApplicationError {
    const { error, statusCode, message, messageCode } = opts;

    // Fallback for a FOREIGN error that sets its own code; an ApplicationError reports via `normalized`.
    const code =
      messageCode ??
      MessageCode.resolve('messageCode' in error ? (error.messageCode as string) : undefined);

    const normalized =
      'normalized' in error
        ? (error.normalized as IResolvedApplicationError['normalized'])
        : { text: message, code, args: {} };

    return { statusCode, message, normalized };
  }

  private resolve(opts: { error: TThrown; isProduction: boolean }): IResolvedApplicationError {
    const { error, isProduction } = opts;
    const dbError = isDatabaseClientError({ error, isProduction });

    switch (this.classify({ error, dbError })) {
      case ApplicationErrorTypes.DATABASE_CLIENT: {
        return this.build({
          error,
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          // The fallback is unreachable today; it keeps the driver's raw text from ever surfacing.
          message: dbError.message ?? DEFAULT_INTERNAL_ERROR_MESSAGE,
        });
      }

      case ApplicationErrorTypes.DATABASE_RETRYABLE: {
        return this.build({
          error,
          statusCode: HTTP.ResultCodes.RS_4.Conflict,
          message: DATABASE_RETRYABLE_ERROR_MESSAGE,
          messageCode: DATABASE_RETRYABLE_ERROR_CODE,
        });
      }

      case ApplicationErrorTypes.INTENTIONAL: {
        return this.build({
          error,
          statusCode: (error as Error & { statusCode: number }).statusCode,
          message: error.message,
        });
      }

      default: {
        return this.build({
          error,
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          // Never leak a raw message - it may carry SQL, schema names or connection details.
          message: isProduction ? DEFAULT_INTERNAL_ERROR_MESSAGE : error.message,
        });
      }
    }
  }

  value(): ErrorHandler {
    return async (error, context) => {
      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);

      this.logger.error(
        '[%s] REQUEST ERROR | path: %s | method: %s | url: %s | Error: %s',
        requestId,
        context.req.path,
        context.req.method,
        context.req.url,
        error,
      );

      const isProduction = this.isProduction({ context, error, requestId });

      if (error.name === 'ZodError') {
        const rs = formatZodError({
          isProduction,
          requestId,
          url: context.req.url,
          path: context.req.path,
          error,
        });

        return context.json(
          this.withRootKey(rs.response),
          rs.statusCode as Parameters<typeof context.json>[1],
        );
      }

      const { statusCode, message, normalized } = this.resolve({ error, isProduction });

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
