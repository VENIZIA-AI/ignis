import type { ValueOrPromise } from '@/common';
import type { IRetryBackoffOptions, IRetryContext } from '@/modules/retry/common/types';
import type { IUrlSafetyPolicy } from '@/modules/network/utilities/url-safety/common/types';
import type { AxiosInstance, AxiosResponse } from 'axios';
import type { TFetcherVariant } from '../../common';
import type { TNullable } from '@/common/types';

/** What a fetcher of this variant answers: a `Response` for `'native'`, an `AxiosResponse` for `'axios'`. */
export type TFetcherResponse<T extends TFetcherVariant> = T extends 'native'
  ? Response
  : AxiosResponse<unknown>;

/** The client a fetcher of this variant wraps (`getWorker()`): `fetch` or an axios instance. */
export type TFetcherWorker<T extends TFetcherVariant> = T extends 'axios'
  ? AxiosInstance
  : typeof fetch;

/** A header map as a call or a default writes it: a `Headers`, `[name, value]` pairs or a record. In a record a `null` or `undefined` value removes that header (a default included); a number is sent as text. */
export type THttpHeaders =
  | Headers
  | Array<[string, string]>
  | Record<string, TNullable<string | number>>;

/** What a fetcher answers when the call passes a `schema`: the parsed body beside the raw response. */
export interface IFetchParsed<D, RS> {
  data: D;
  status: number;
  headers: Headers;
  response: RS;
}

/** Retry settings of a call; the presence of the object turns retrying on. They are `RetryUtility.executeWithRetry`'s. */
export interface IHttpRetryOptions {
  /** @default 3 */
  maxAttempts?: number;
  /** The budget across every attempt and wait, in milliseconds; a `Retry-After` that does not fit ends the retries. */
  maxTotalMs?: number;
  backoff?: IRetryBackoffOptions;
  /** Replaces the default decision (network error, timeout, 5xx and 429 retry; any other 4xx, a 3xx, a guard refusal, a schema mismatch and a caller abort do not). */
  shouldRetry?: (context: IRetryContext) => ValueOrPromise<boolean>;
  onRetry?: (context: IRetryContext & { nextDelayMs: number }) => ValueOrPromise<void>;
}

/** What a fetcher applies to every call unless the call says otherwise. */
export interface IFetcherDefaults {
  /** Per attempt, in milliseconds. */
  timeout?: number;
  headers?: THttpHeaders;
  retry?: IHttpRetryOptions;
  maxBytes?: number;
  /** A call may replace this policy with its own; it cannot switch the guard off. */
  guard?: IUrlSafetyPolicy;
}

/** The request a hook sees. The url is read-only: a hook cannot send the call elsewhere, so the guard vets what is sent. */
export interface IFetchRequestContext {
  readonly method: string;
  readonly url: string;
  /** Mutable: `onRequest` signs or stamps the request here. */
  readonly headers: Headers;
  /** 1 for the first attempt, then one more per retry. */
  readonly attempt: number;
}

/** One function per moment; none returns a value. */
export interface IFetcherHooks {
  /** Before EVERY send, each retry attempt included, so a signature is fresh. */
  onRequest?: (context: IFetchRequestContext) => ValueOrPromise<void>;
  /** An answer arrived, BEFORE the status check and the schema parse. Once per attempt. */
  onResponse?: (context: {
    request: IFetchRequestContext;
    status: number;
    headers: Headers;
    durationMs: number;
  }) => ValueOrPromise<void>;
  /** The call failed (a timeout, the network, a refused status, a schema mismatch, a guard refusal); once, with the final error, which is then rethrown. */
  onError?: (context: {
    request: IFetchRequestContext;
    error: unknown;
    attempt: number;
  }) => ValueOrPromise<void>;
}
