import {
  DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE,
  DATABASE_CLIENT_ERROR_MESSAGES,
  POSTGRES_CLIENT_ERROR_CLASSES,
  POSTGRES_RETRYABLE_ERROR_CODES,
} from './definition';
import { PostgresErrors } from './postgres-errors';

export class DatabaseErrorHandler {
  /** True for a database error caused by the request (SQLSTATE class 22/23/44) -> HTTP 400; in production the detail/table/constraint context is suppressed so no row values or schema internals leak. */
  static isDatabaseClientError(opts: { error: Error; isProduction: boolean }): {
    isClientError: boolean;
    message?: string;
  } {
    const { error, isProduction } = opts;
    // The same walk an application uses: the Postgres error may sit several `cause`s down, and a value without a SQLSTATE `code` (a gRPC numeric one, ECONNRESET) is not one, so this last-resort handler never crashes on it.
    const pgError = PostgresErrors.find({ error });

    // Only request-caused SQLSTATE classes are client errors.
    if (!pgError || !POSTGRES_CLIENT_ERROR_CLASSES.includes(pgError.code.slice(0, 2))) {
      return { isClientError: false };
    }

    const { code } = pgError;

    const baseMessage =
      DATABASE_CLIENT_ERROR_MESSAGES[code] ?? DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE;

    // In production expose ONLY the generic base message: `detail` can echo row values and `table`/`constraint` reveal schema internals.
    if (isProduction) {
      return { isClientError: true, message: baseMessage };
    }

    // Non-production: append driver-provided context to aid debugging.
    const lines = [baseMessage];

    if (pgError.detail) {
      lines.push(`Detail: ${pgError.detail}`);
    }

    if (pgError.table) {
      lines.push(`Table: ${pgError.table}`);
    }

    if (pgError.constraint) {
      lines.push(`Constraint: ${pgError.constraint}`);
    }

    return {
      isClientError: true,
      message: lines.join('\n'),
    };
  }

  /** True for a transient, retryable transaction conflict (serialization failure / deadlock - SQLSTATE 40001 / 40P01) -> HTTP 409: the client can retry the same request. */
  static isRetryableDatabaseError(opts: { error: Error }): boolean {
    const pgError = PostgresErrors.find({ error: opts.error });

    return pgError !== undefined && POSTGRES_RETRYABLE_ERROR_CODES.includes(pgError.code);
  }
}
