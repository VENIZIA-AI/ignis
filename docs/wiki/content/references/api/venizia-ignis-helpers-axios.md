---
title: "@venizia/ignis-helpers/axios"
description: "Every export of @venizia/ignis-helpers/axios, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/axios`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

4 exports, 4 with TSDoc.

## `AxiosFetcher`

*class*

Fetcher over an axios instance (`getWorker()`): the pipeline of `AbstractNetworkFetchableHelper` with axios as the client. HTTPS calls share one keep-alive agent that verifies certificates unless `rejectUnauthorized` is `false`; an `httpsAgent` passed in the request wins - and is refused together with a `guard`, because an agent of the caller's could connect elsewhere than the vetted address.

```ts
export declare class AxiosFetcher extends AbstractNetworkFetchableHelper<'axios', IAxiosRequestOptions, AxiosResponse<unknown>, AxiosInstance> {
    /**
     * One agent for the instance, not one per request. Built here so TLS verification is decided
     * ONCE, at construction, rather than per call - and so connections are actually reused: a fresh
     * agent per request forces a new TCP and TLS handshake every time (measured: 10 handshakes for 10
     * requests, versus 1). A guarded call never uses it: it gets an agent of its own that answers one vetted address and is dropped with the call, so no pin outlives it.
     */
    private readonly httpsAgent;
    private readonly isRejectingUnauthorized;
    /** What the caller put in `defaultConfigs`: a guarded call checks it like its own options. */
    private readonly configured;
    constructor(opts: {
        name: string;
        defaultConfigs?: Omit<AxiosRequestConfig, TRefusedAxiosFields>;
        /** Joined to a relative call url; an absolute one is sent as it is. Unset, `defaultConfigs.baseURL` is used. */
        baseUrl?: string;
        defaults?: IFetcherDefaults;
        hooks?: IFetcherHooks;
        /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
        guardEngine?: IFetchGuard;
        logger?: ILogger;
        /**
         * Whether this instance rejects an HTTPS server whose certificate fails verification.
         * `false` turns verification off.
         * @default true
         */
        rejectUnauthorized?: boolean;
    });
    protected readonly refusedCallFields: Readonly<Record<string, string>>;
    protected assertCallSupported(opts: {
        guard?: IUrlSafetyPolicy;
        extra: Record<string | symbol, unknown>;
    }): void;
    protected buildUrl(opts: {
        url: string;
        params?: Record<string, unknown>;
    }): string;
    /** An axios body-size overflow is the cap's refusal (permanent), not a transport error the retry would repeat. */
    private refineError;
    protected exchange(opts: IFetchExchangeRequest): Promise<IFetchExchange<AxiosResponse<unknown>>>;
}

/** Axios fields a default can never carry: the pipeline sends the body from `body`, decides which statuses throw (`acceptStatus`) and sends one absolute url, so a default `data`, `validateStatus` or `allowAbsoluteUrls` would be overwritten or would make axios join the url twice. */
type TRefusedAxiosFields = 'data' | 'validateStatus' | 'allowAbsoluteUrls';
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`

## `AxiosNetworkRequest`

*class*

`BaseNetworkRequest` over an `AxiosFetcher`. Defaults: JSON content type and a 60000 ms `timeout`; a status outside 2xx throws a `UrlFetchError`.

```ts
export declare class AxiosNetworkRequest extends BaseNetworkRequest<'axios'> {
    constructor(opts: IAxiosNetworkRequestOptions);
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`

## `IAxiosNetworkRequestOptions`

*interface*

Options of `AxiosNetworkRequest`: an axios config with `baseUrl` in place of `baseURL`.

```ts
export interface IAxiosNetworkRequestOptions {
    name: string;
    networkOptions: Omit<AxiosRequestConfig, 'baseURL' | 'headers' | 'timeout' | TRefusedAxiosFields> & {
        baseUrl?: string;
        headers?: Record<string, string>;
        /** Per attempt, in milliseconds. @default 60000 */
        timeout?: number;
    };
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    guardEngine?: IFetchGuard;
}

/** Axios fields a default can never carry: the pipeline sends the body from `body`, decides which statuses throw (`acceptStatus`) and sends one absolute url, so a default `data`, `validateStatus` or `allowAbsoluteUrls` would be overwritten or would make axios join the url twice. */
type TRefusedAxiosFields = 'data' | 'validateStatus' | 'allowAbsoluteUrls';
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`

## `IAxiosRequestOptions`

*interface*

Request accepted by `AxiosFetcher`: an axios config where `body` is sent as the axios `data`. `rejectUnauthorized` set here overrides the instance setting for this call.

```ts
export interface IAxiosRequestOptions extends Omit<AxiosRequestConfig, TOwnedAxiosFields>, IRequestOptions {
    url: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
    /** Not accepted: the body is sent from `body`, so an axios `data` would be dropped. Pass `body`. */
    data?: never;
    /** Not accepted: which statuses throw is `acceptStatus`, so an axios `validateStatus` would be dropped. */
    validateStatus?: never;
    /** Not accepted: `params` are written into the url by the pipeline, so a call's `paramsSerializer` would be dropped. */
    paramsSerializer?: never;
    /** Not accepted: the base is the fetcher's `baseUrl`, so a call's `baseURL` would be ignored. */
    baseURL?: never;
    /** Not accepted: the pipeline sends one absolute url, so axios must not join it again. */
    allowAbsoluteUrls?: never;
    /** Whether this call rejects an HTTPS server whose certificate fails verification; `false` turns verification off for this call. */
    rejectUnauthorized?: boolean;
}

/** The fields of an axios config the pipeline owns. */
type TOwnedAxiosFields = 'url' | 'method' | 'params' | 'data' | 'headers' | 'signal' | 'timeout' | 'maxRedirects' | 'validateStatus';
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`
