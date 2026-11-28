import { HTTP } from '@venizia/ignis-helpers/common';
import { LogLevels, type TLogLevel } from '@venizia/ignis-helpers/core';
import type { ErrorHandler } from 'hono';
import { AppErrorMiddleware } from '@/base/middlewares/app-error/app-error.middleware';

/** The refusals a caller causes in normal use. */
const EXPECTED_REFUSALS = new Set<number>([
  HTTP.ResultCodes.RS_4.Unauthorized,
  HTTP.ResultCodes.RS_4.Forbidden,
  HTTP.ResultCodes.RS_4.NotFound,
]);

/**
 * The error handler of a failed RPC: {@link AppErrorMiddleware}, logging a 401, 403 or 404 at `warn` unless the throw
 * site set a `logLevel`.
 *
 * @internal
 */
export class GrpcErrorMiddleware extends AppErrorMiddleware {
  protected override resolveLogLevel(opts: {
    error: Parameters<ErrorHandler>[0];
    statusCode: number;
  }): TLogLevel {
    const isUnset = Reflect.get(opts.error, 'logLevel') === undefined;

    if (isUnset && EXPECTED_REFUSALS.has(opts.statusCode)) {
      return LogLevels.WARN;
    }

    return super.resolveLogLevel(opts);
  }
}
