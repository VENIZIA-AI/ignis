import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-inversion';
import { ApplicationError, ErrorScopes } from '@venizia/ignis-inversion';

/** Errors a fetcher raises that are not a refusal of the url guard. */
const FetchErrors = {
  SCHEMA_MISMATCH: {
    message: {
      text: 'The upstream answered something else than the schema describes',
      code: 'core.fetch.schema_mismatch',
    },
    statusCode: HTTP.ResultCodes.RS_5.BadGateway,
    category: ErrorScopes.INTEGRATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** One place a body failed its schema: where, and which rule. Never the value found there. */
export interface IFetchSchemaIssue {
  path: Array<string | number>;
  code: string;
}

/**
 * The body parsed, but it is not what the schema says: the upstream answered something else (502). The message and the
 * issues name paths and rules only, so no part of the body leaves with the error.
 */
export class FetchSchemaError extends ApplicationError {
  /** The status the upstream answered with. */
  readonly status: number;
  readonly url: string;
  readonly issues: IFetchSchemaIssue[];

  constructor(opts: { status: number; url: string; issues: IFetchSchemaIssue[] }) {
    const where = opts.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.code}`)
      .join(', ');

    super({
      error: FetchErrors.SCHEMA_MISMATCH,
      message: `[fetch] The response does not match the schema | status: ${opts.status} | url: ${opts.url} | issues: ${where}`,
    });

    this.name = 'FetchSchemaError';
    this.status = opts.status;
    this.url = opts.url;
    this.issues = opts.issues;
  }

  static is(error: unknown): error is FetchSchemaError {
    return error instanceof FetchSchemaError;
  }
}

declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof FetchErrors> {}
}
