import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { ApplicationErrorTypes } from '../definition';

/** A Postgres error as every driver reports it, under one set of names. Only `code` is always there; the rest is what the server sent for that error. */
export interface IPostgresError {
  /** The 5-character SQLSTATE (`23505`, `40P01`, ...); compare it with `PostgresErrorCodes`. */
  code: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  schema?: string;
  message?: string;
}

export interface IZodIssueLike {
  path: Array<string | number>;
  message: string;
  code?: string;
  params?: Record<string, unknown>;
  expected?: unknown;
  received?: unknown;
}

export type TApplicationErrorType = TConstValue<typeof ApplicationErrorTypes>;

export interface IResolvedApplicationError {
  statusCode: number;
  message: string;
  normalized: { text: string; code: string; args: Record<string, unknown> };
  /** Drives whether the log carries a stack - only an UNEXPECTED failure needs one. */
  type: TApplicationErrorType;
}
