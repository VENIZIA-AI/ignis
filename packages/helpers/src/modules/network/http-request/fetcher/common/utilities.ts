import { HTTP } from '@/common/constants/http';
import {
  UrlFetchError,
  UrlSafetyRefusals,
} from '@/modules/network/utilities/url-safety/common/errors';
import { FetchSchemaError } from './errors';
import type { THttpHeaders } from './types';

/** Header maps: merged per header, the call winning, a `null` or `undefined` value removing a header. */
export class HttpHeaders {
  /** The headers of `layers` in order, later layers over earlier ones, as one `Headers`. */
  static merge(opts: { layers: ReadonlyArray<THttpHeaders | undefined> }): Headers {
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

  /** `merge` under a JSON content type: the layers may replace it (any case) or remove it with `null`. */
  static withJsonDefault(opts: { layers: ReadonlyArray<THttpHeaders | undefined> }): Headers {
    return HttpHeaders.merge({
      layers: [
        { [HTTP.Headers.CONTENT_TYPE]: HTTP.HeaderValues.APPLICATION_JSON_UTF8 },
        ...opts.layers,
      ],
    });
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

/** Which statuses a fetcher takes as an answer. */
export class HttpStatus {
  /** Whether `status` is 2xx. */
  private static isSuccess(opts: { status: number }): boolean {
    return Math.floor(opts.status / 100) === 2;
  }

  /** The one place `acceptStatus` becomes a decision: a list adds to 2xx, a function replaces it, unset is 2xx. */
  static toPredicate(opts: {
    accept: ReadonlyArray<number> | ((status: number) => boolean) | undefined;
  }): (status: number) => boolean {
    const { accept } = opts;

    if (typeof accept === 'function') {
      return accept;
    }

    const extra = new Set(accept);

    return (status) => HttpStatus.isSuccess({ status }) || extra.has(status);
  }
}

/** The statuses that name a new location; a 304 or a 300 is an answer, not a redirect. */
const REDIRECT_STATUSES: ReadonlyArray<number> = [301, 302, 303, 307, 308];

/** The redirect rules of a fetcher that walks redirects by hand. */
export class HttpRedirects {
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
    return REDIRECT_STATUSES.includes(opts.status);
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
export class HttpRetry {
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

    if (FetchSchemaError.is(error) || UrlSafetyRefusals.is({ error })) {
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
