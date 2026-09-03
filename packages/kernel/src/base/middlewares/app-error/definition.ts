import { CoreErrorCodes } from '@/common/error-codes';
/** PostgreSQL SQLSTATE codes representing a CLIENT error (HTTP 400) - caused by the request/data, not a server fault. @see https://www.postgresql.org/docs/current/errcodes-appendix.html */
export const PostgresErrorCodes = {
  // Class 22 - Data Exception (malformed / out-of-range values)
  DATA_EXCEPTION: '22000',
  STRING_DATA_TOO_LONG: '22001',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  NULL_VALUE_NOT_ALLOWED: '22004',
  INVALID_DATETIME_FORMAT: '22007',
  DATETIME_FIELD_OVERFLOW: '22008',
  INVALID_TIME_ZONE_DISPLACEMENT_VALUE: '22009',
  SUBSTRING_ERROR: '22011',
  DIVISION_BY_ZERO: '22012',
  INVALID_PARAMETER_VALUE: '22023',
  INVALID_ESCAPE_SEQUENCE: '22025',
  STRING_DATA_LENGTH_MISMATCH: '22026',
  DUPLICATE_JSON_OBJECT_KEY_VALUE: '22030',
  INVALID_JSON_TEXT: '22032',
  FLOATING_POINT_EXCEPTION: '22P01',
  INVALID_TEXT_REPRESENTATION: '22P02',
  INVALID_BINARY_REPRESENTATION: '22P03',
  UNTRANSLATABLE_CHARACTER: '22P05',
  // Class 23 - Integrity Constraint Violation
  INTEGRITY_CONSTRAINT_VIOLATION: '23000',
  RESTRICT_VIOLATION: '23001',
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
  // Class 44 - WITH CHECK OPTION Violation (row written through an updatable view fails its CHECK)
  WITH_CHECK_OPTION_VIOLATION: '44000',
} as const;

/** SQLSTATE classes (first two chars) mapped to HTTP 400; codes without a specific message use {@link DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE}. Deliberately excluded (stay 500): 42, 53, 0A, 25, 28, 21, 54; class 40 is transient/retryable, NOT a 400. */
export const POSTGRES_CLIENT_ERROR_CLASSES: readonly string[] = ['22', '23', '44'];

/** Human-readable message per specific SQLSTATE code. */
export const DATABASE_CLIENT_ERROR_MESSAGES: Record<string, string> = {
  // Class 22 - Data Exception
  [PostgresErrorCodes.DATA_EXCEPTION]: 'Invalid data value',
  [PostgresErrorCodes.STRING_DATA_TOO_LONG]: 'String data too long',
  [PostgresErrorCodes.NUMERIC_VALUE_OUT_OF_RANGE]: 'Numeric value out of range',
  [PostgresErrorCodes.NULL_VALUE_NOT_ALLOWED]: 'Null value not allowed',
  [PostgresErrorCodes.INVALID_DATETIME_FORMAT]: 'Invalid date/time format',
  [PostgresErrorCodes.DATETIME_FIELD_OVERFLOW]: 'Date/time field value out of range',
  [PostgresErrorCodes.INVALID_TIME_ZONE_DISPLACEMENT_VALUE]: 'Invalid time zone displacement value',
  [PostgresErrorCodes.SUBSTRING_ERROR]: 'Substring error',
  [PostgresErrorCodes.DIVISION_BY_ZERO]: 'Division by zero',
  [PostgresErrorCodes.INVALID_PARAMETER_VALUE]: 'Invalid parameter value',
  [PostgresErrorCodes.INVALID_ESCAPE_SEQUENCE]: 'Invalid escape sequence',
  [PostgresErrorCodes.STRING_DATA_LENGTH_MISMATCH]: 'String data length mismatch',
  [PostgresErrorCodes.DUPLICATE_JSON_OBJECT_KEY_VALUE]: 'Duplicate JSON object key',
  [PostgresErrorCodes.INVALID_JSON_TEXT]: 'Invalid JSON text',
  [PostgresErrorCodes.FLOATING_POINT_EXCEPTION]: 'Floating point exception',
  [PostgresErrorCodes.INVALID_TEXT_REPRESENTATION]: 'Invalid text representation',
  [PostgresErrorCodes.INVALID_BINARY_REPRESENTATION]: 'Invalid binary representation',
  [PostgresErrorCodes.UNTRANSLATABLE_CHARACTER]: 'Untranslatable character',
  // Class 23 - Integrity Constraint Violation
  [PostgresErrorCodes.INTEGRITY_CONSTRAINT_VIOLATION]: 'Integrity constraint violation',
  [PostgresErrorCodes.RESTRICT_VIOLATION]: 'Restrict constraint violation',
  [PostgresErrorCodes.NOT_NULL_VIOLATION]: 'Not null constraint violation',
  [PostgresErrorCodes.FOREIGN_KEY_VIOLATION]: 'Foreign key constraint violation',
  [PostgresErrorCodes.UNIQUE_VIOLATION]: 'Unique constraint violation',
  [PostgresErrorCodes.CHECK_VIOLATION]: 'Check constraint violation',
  [PostgresErrorCodes.EXCLUSION_VIOLATION]: 'Exclusion constraint violation',
  // Class 44 - WITH CHECK OPTION Violation
  [PostgresErrorCodes.WITH_CHECK_OPTION_VIOLATION]: 'View check option violation',
};

/** Fallback message for a client-class (22/23/44) error that has no specific message above. */
export const DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE = 'Invalid database request';

/** SQLSTATE codes for transient, retryable transaction conflicts (-> HTTP 409) - the transaction lost a concurrency race, not bad input (400) and not a server bug (500). */
export const POSTGRES_RETRYABLE_ERROR_CODES: readonly string[] = [
  '40001', // serialization_failure
  '40P01', // deadlock_detected
];

/** Safe, generic message + stable code for a retryable DB conflict (never leaks internals). */
export const DATABASE_RETRYABLE_ERROR_MESSAGE =
  'The request conflicted with a concurrent operation; please retry.';
export const DATABASE_RETRYABLE_ERROR_CODE = CoreErrorCodes.DATABASE_CONFLICT;

/** The branch a thrown value takes through the handler. */
export class ApplicationErrorTypes {
  static readonly DATABASE_CLIENT = 'database-client';
  static readonly DATABASE_RETRYABLE = 'database-retryable';
  static readonly INTENTIONAL = 'intentional';
  static readonly UNEXPECTED = 'unexpected';
}
