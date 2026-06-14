import {
  DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE,
  DATABASE_CLIENT_ERROR_MESSAGES,
  POSTGRES_CLIENT_ERROR_CLASSES,
  POSTGRES_RETRYABLE_ERROR_CODES,
} from './definition';
import { IDatabaseError } from './types';

/**
 * Checks if error is a database constraint error caused by the request (SQLSTATE class 22/23/44)
 * and should return HTTP 400. In production the detail/table/constraint context is suppressed so
 * no row values or schema internals leak; in non-production it is appended to aid debugging.
 */
export const isDatabaseClientError = (opts: {
  error: Error;
  isProduction: boolean;
}): { isClientError: boolean; message?: string } => {
  const { error, isProduction } = opts;
  const dbError = error as IDatabaseError;
  const cause = dbError.cause;
  const code = dbError.code || cause?.code;

  // Only SQLSTATE classes caused by the request — 22 (data exception) and 23 (integrity violation) —
  // are client errors. Anything else (e.g. class 42 syntax/undefined-column, 53 resources) stays 500.
  // A missing or non-string code (e.g. a gRPC numeric code) is treated as non-client and must never
  // crash this last-resort handler.
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
  const code = dbError.code || dbError.cause?.code;
  return typeof code === 'string' && POSTGRES_RETRYABLE_ERROR_CODES.includes(code);
};
