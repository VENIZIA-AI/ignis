import {
  DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE,
  DATABASE_CLIENT_ERROR_MESSAGES,
  POSTGRES_CLIENT_ERROR_CLASSES,
  POSTGRES_RETRYABLE_ERROR_CODES,
} from './definition';
import type { IDatabaseError } from './types';

/** True for a database error caused by the request (SQLSTATE class 22/23/44) -> HTTP 400. In
 * production the detail/table/constraint context is suppressed so no row values or schema internals
 * leak; in non-production it is appended to aid debugging. */
export const isDatabaseClientError = (opts: {
  error: Error;
  isProduction: boolean;
}): { isClientError: boolean; message?: string } => {
  const { error, isProduction } = opts;
  const dbError = error as IDatabaseError;
  const cause = dbError.cause;
  const code = [dbError.code, cause?.code].find(Boolean);

  // Only request-caused SQLSTATE classes are client errors; anything else stays 500. A missing or
  // non-string code (e.g. a gRPC numeric code) is non-client and must never crash this
  // last-resort handler.
  if (typeof code !== 'string' || !POSTGRES_CLIENT_ERROR_CLASSES.includes(code.slice(0, 2))) {
    return { isClientError: false };
  }

  const baseMessage =
    DATABASE_CLIENT_ERROR_MESSAGES[code] ?? DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE;

  // In production, expose ONLY the generic base message. `detail` can echo row values
  // (e.g. "Key (email)=(a@b.com) already exists") and `table`/`constraint` reveal schema internals.
  if (isProduction) {
    return { isClientError: true, message: baseMessage };
  }

  // Non-production: append driver-provided context to aid debugging.
  const lines = [baseMessage];
  if (cause?.detail) {
    lines.push(`Detail: ${cause.detail}`);
  }

  if (cause?.table) {
    lines.push(`Table: ${cause.table}`);
  }

  if (cause?.constraint) {
    lines.push(`Constraint: ${cause.constraint}`);
  }

  return {
    isClientError: true,
    message: lines.join('\n'),
  };
};

/**
 * Checks if error is a transient, retryable DB transaction conflict (serialization failure /
 * deadlock — SQLSTATE 40001 / 40P01). These map to HTTP 409: the client can retry the same request.
 */
export const isRetryableDatabaseError = (opts: { error: Error }): boolean => {
  const dbError = opts.error as IDatabaseError;
  const code = [dbError.code, dbError.cause?.code].find(Boolean);
  return typeof code === 'string' && POSTGRES_RETRYABLE_ERROR_CODES.includes(code);
};
