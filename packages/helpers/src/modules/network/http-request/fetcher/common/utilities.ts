import { HTTP } from '@/common/constants/http';
import { UrlPolicy } from '@/modules/network/utilities/url-safety/policy';
import { UrlFetchError } from '@/modules/network/utilities/url-safety/common/errors';
import { FetchSchemaError } from './errors';
import type { TFetchHeaders } from './types';

/** Header maps: merged per header, the call winning, a `null` or `undefined` value removing a header. */
export class FetchHeaders {
  /** The headers of `layers` in order, later layers over earlier ones, as one `Headers`. */
  static merge(opts: { layers: ReadonlyArray<TFetchHeaders | undefined> }): Headers {
    const merged = new Headers();

    for (const layer of opts.layers) {
      if (layer === undefined) {
        continue;
      }

      if (layer instanceof Headers) {
        layer.forEach((value, name) => merged.set(name, value));
        continue;
      }

      for (const [name, value] of Object.entries(layer)) {
        if (value === null || value === undefined) {
          merged.delete(name);
        } else {
          merged.set(name, value);
        }
      }
    }

    return merged;
  }

  /** A copy of `headers` keeping only the names in `names`. */
  static only(opts: { headers: Headers; names: ReadonlyArray<string> }): Headers {
    const kept = new Headers();

    opts.headers.forEach((value, name) => {
      if (opts.names.includes(name.toLowerCase())) {
        kept.set(name, value);
      }
    });

    return kept;
  }

  /** A copy of `headers` without the names in `names`. */
  static without(opts: { headers: Headers; names: ReadonlyArray<string> }): Headers {
    const kept = new Headers();

    opts.headers.forEach((value, name) => {
      if (!opts.names.includes(name.toLowerCase())) {
        kept.set(name, value);
      }
    });

    return kept;
  }
}

/** The redirect rules of a fetcher that walks redirects by hand. */
export class FetchRedirects {
  /** The statuses that name a new location; a 304 or a 300 is an answer, not a redirect. */
  static readonly STATUSES: ReadonlyArray<number> = [301, 302, 303, 307, 308];

  /** Request headers that name the body; they go when a redirect turns the request into a GET. */
  static readonly BODY_HEADERS: ReadonlyArray<string> = [
    HTTP.Headers.CONTENT_TYPE,
    HTTP.Headers.CONTENT_LENGTH,
    HTTP.Headers.CONTENT_ENCODING,
  ];

  /**
   * The only caller headers a cross-origin redirect keeps. Every other one is dropped: a tenant's webhook secret
   * (`x-api-key`, a signature) must not follow a redirect to a host that tenant did not name.
   */
  static readonly CROSS_ORIGIN_HEADERS: ReadonlyArray<string> = [
    HTTP.Headers.ACCEPT,
    HTTP.Headers.ACCEPT_LANGUAGE,
    HTTP.Headers.USER_AGENT,
  ];

  static isRedirect(opts: { status: number }): boolean {
    return FetchRedirects.STATUSES.includes(opts.status);
  }

  /** 303, and a POST answered 301 or 302, continue as a GET without the body. */
  static becomesGet(opts: { status: number; method: string }): boolean {
    return (
      opts.status === 303 ||
      ((opts.status === 301 || opts.status === 302) && opts.method === 'POST')
    );
  }
}

/** What a retried call retries, and for how long a server asks it to wait. */
export class FetchRetry {
  /** The longest wait a call takes between two attempts unless `backoff.maxDelayMs` says otherwise; the retry helper's own default. */
  static readonly DEFAULT_MAX_DELAY_MS = 30_000;

  /**
   * The default decision: a network error, a timeout, a 5xx and a 429 are worth another attempt. Any other 4xx, a 3xx, a
   * url the guard refused (refused forever), a schema mismatch and a caller's own abort are not.
   */
  static isRetryable(opts: { error: unknown; signal?: AbortSignal }): boolean {
    const { error, signal } = opts;

    if (UrlFetchError.is(error)) {
      return error.status >= 500 || error.status === 429;
    }

    if (FetchSchemaError.is(error) || UrlPolicy.isRefusedError({ error })) {
      return false;
    }

    // The caller's own abort ends the call; a per-attempt timeout is not the caller's and is retried.
    return signal?.aborted !== true;
  }

  /** The wait a 429 or 503 asks for in `Retry-After`, in milliseconds: seconds, or an HTTP date. `undefined` when there is none. */
  static readRetryAfterMs(opts: { error: unknown; now?: number }): number | undefined {
    const { error } = opts;

    if (!UrlFetchError.is(error) || (error.status !== 429 && error.status !== 503)) {
      return undefined;
    }

    const header = error.headers.get(HTTP.Headers.RETRY_AFTER)?.trim();

    if (!header) {
      return undefined;
    }

    if (/^\d+$/.test(header)) {
      const seconds = Number(header);

      return Number.isSafeInteger(seconds) ? seconds * 1000 : undefined;
    }

    // An HTTP date has letters (`Thu, 19 Nov ...`); a bare number that is not whole seconds is garbage, not a date.
    if (!/[a-z]/i.test(header)) {
      return undefined;
    }

    const date = Date.parse(header);

    return Number.isNaN(date) ? undefined : Math.max(0, date - (opts.now ?? Date.now()));
  }
}
