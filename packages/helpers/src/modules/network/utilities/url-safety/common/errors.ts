import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-inversion';
import { ApplicationError, ErrorScopes } from '@venizia/ignis-inversion';

/**
 * A url the policy refuses is refused forever - the same url will never be allowed. A caller that
 * retries on failure has to tell that apart from a host that timed out, or it retries a rejection
 * and turns the guard into a repeat scanner.
 */
export const UrlSafetyErrors = {
  URL_REFUSED: {
    message: { text: 'Url refused by the safety policy', code: 'core.url_safety.url_refused' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

/**
 * The upstream answered, and the answer is not one a fetcher returns: a status `acceptStatus` refuses (a 4xx or 5xx
 * by default), or a redirect it was not allowed to follow (`maxRedirects: 0`, or a `Location` that is not a url).
 * `status` is the upstream's; `statusCode` (inherited) is the one this server answers with, and stays 400. `response` carries the first 64 KiB
 * of the body, still readable, and the socket is free.
 */
export class UrlFetchError<R = Response> extends ApplicationError {
  /** How much of a refused answer's body stays readable on `response`. */
  static readonly MAX_BODY_BYTES = 64 * 1024;

  /** The status the upstream answered with. */
  readonly status: number;
  /** The url the caller asked for (the first hop, not a redirect's target). */
  readonly url: string;
  /** The upstream's headers. */
  readonly headers: Headers;
  /** The upstream's answer as the fetcher's client has it, with up to `MAX_BODY_BYTES` of its body readable. */
  readonly response?: R;
  /** The raw `Location` header of a redirect, as sent; unset for a non-redirect or when the header was missing. */
  readonly location?: string;

  constructor(opts: {
    message: string;
    status: number;
    url: string;
    headers?: Headers;
    response?: R;
    location?: string;
  }) {
    super({ message: opts.message });

    this.name = 'UrlFetchError';
    this.status = opts.status;
    this.url = opts.url;
    this.headers = opts.headers ?? new Headers();
    this.response = opts.response;
    this.location = opts.location;
  }

  /** Whether `error` is a `UrlFetchError`: the shape a caller narrows on before it reads `status`. */
  static is(error: unknown): error is UrlFetchError<unknown> {
    return error instanceof UrlFetchError;
  }
}

declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof UrlSafetyErrors> {}
}
