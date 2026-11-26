import {
  DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE,
  DATABASE_CLIENT_ERROR_MESSAGES,
  DatabaseErrorCodes,
  POSTGRES_CLIENT_ERROR_CLASSES,
  POSTGRES_RETRYABLE_ERROR_CODES,
  PostgresErrorCodes,
  type TDatabaseErrorCode,
} from './definition';
import { PostgresErrors } from './postgres-errors';

export class DatabaseErrorHandler {
  /** True for a database error caused by the request (SQLSTATE class 22/23/44) -> HTTP 400; in production the detail/table/constraint context is suppressed so no row values or schema internals leak. */
  static isDatabaseClientError(opts: { error: Error; isProduction: boolean }): {
    isClientError: boolean;
    message?: string;
    messageCode?: TDatabaseErrorCode;
  } {
    const { error, isProduction } = opts;
    // A value without a SQLSTATE `code` (a gRPC numeric one, `ECONNRESET`) is not a Postgres error.
    const pgError = PostgresErrors.find({ error });

    // Only request-caused SQLSTATE classes are client errors.
    if (!pgError || !POSTGRES_CLIENT_ERROR_CLASSES.includes(pgError.code.slice(0, 2))) {
      return { isClientError: false };
    }

    const { code } = pgError;

    const baseMessage =
      DATABASE_CLIENT_ERROR_MESSAGES[code] ?? DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE;

    const messageCode = DatabaseErrorHandler.resolveMessageCode({ code });

    // In production expose ONLY the generic base message: `detail` can echo row values and `table`/`constraint` reveal schema internals.
    if (isProduction) {
      return { isClientError: true, message: baseMessage, messageCode };
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
      messageCode,
    };
  }

  /** The code of a client-class SQLSTATE; `undefined` for any other, which then answers the default code. */
  private static resolveMessageCode(opts: { code: string }): TDatabaseErrorCode | undefined {
    switch (opts.code) {
      case PostgresErrorCodes.STRING_DATA_TOO_LONG: {
        return DatabaseErrorCodes.STRING_TOO_LONG;
      }

      case PostgresErrorCodes.NUMERIC_VALUE_OUT_OF_RANGE: {
        return DatabaseErrorCodes.NUMERIC_OUT_OF_RANGE;
      }

      case PostgresErrorCodes.INVALID_TEXT_REPRESENTATION: {
        return DatabaseErrorCodes.INVALID_TEXT_REPRESENTATION;
      }

      case PostgresErrorCodes.NOT_NULL_VIOLATION: {
        return DatabaseErrorCodes.NOT_NULL_VIOLATION;
      }

      case PostgresErrorCodes.FOREIGN_KEY_VIOLATION: {
        return DatabaseErrorCodes.FOREIGN_KEY_VIOLATION;
      }

      case PostgresErrorCodes.UNIQUE_VIOLATION: {
        return DatabaseErrorCodes.UNIQUE_VIOLATION;
      }

      case PostgresErrorCodes.CHECK_VIOLATION: {
        return DatabaseErrorCodes.CHECK_VIOLATION;
      }

      default: {
        return DatabaseErrorHandler.resolveClassMessageCode({
          sqlStateClass: opts.code.slice(0, 2),
        });
      }
    }
  }

  private static resolveClassMessageCode(opts: {
    sqlStateClass: string;
  }): TDatabaseErrorCode | undefined {
    switch (opts.sqlStateClass) {
      case '22': {
        return DatabaseErrorCodes.INVALID_INPUT;
      }

      case '23':
      case '44': {
        return DatabaseErrorCodes.CONSTRAINT_VIOLATION;
      }

      default: {
        return undefined;
      }
    }
  }

  /** True for a transient, retryable transaction conflict (serialization failure / deadlock - SQLSTATE 40001 / 40P01) -> HTTP 409: the client can retry the same request. */
  static isRetryableDatabaseError(opts: { error: Error }): boolean {
    const pgError = PostgresErrors.find({ error: opts.error });

    return pgError !== undefined && POSTGRES_RETRYABLE_ERROR_CODES.includes(pgError.code);
  }
}
