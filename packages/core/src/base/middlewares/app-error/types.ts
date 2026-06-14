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
