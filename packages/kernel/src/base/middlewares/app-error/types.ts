import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { ApplicationErrorTypes } from './definition';

export interface IDatabaseError extends Error {
  code?: string;
  cause?: {
    code?: string;
    detail?: string;
    table?: string;
    constraint?: string;
  };
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
