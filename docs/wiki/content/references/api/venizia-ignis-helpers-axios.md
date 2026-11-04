---
title: "@venizia/ignis-helpers/axios"
description: "Every export of @venizia/ignis-helpers/axios, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/axios`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

4 exports, 4 with TSDoc.

## `AxiosFetcher`

*class*

Fetcher over an axios instance (`getWorker()`). HTTPS calls share one keep-alive agent that verifies certificates unless `rejectUnauthorized` is `false`; an `httpsAgent` passed in the request wins.

```ts
export declare class AxiosFetcher extends AbstractNetworkFetchableHelper<'axios', IAxiosRequestOptions, AxiosResponse<any, any>['data'], AxiosInstance> {
    /**
     * One agent for the instance, not one per request. Built here so TLS verification is decided
     * ONCE, at construction, rather than per call - and so connections are actually reused: a fresh
     * agent per request forces a new TCP and TLS handshake every time (measured: 10 handshakes for 10
     * requests, versus 1).
     */
    private readonly httpsAgent;
    constructor(opts: {
        name: string;
        defaultConfigs: AxiosRequestConfig;
        logger?: ILogger;
        /**
         * Whether this instance rejects an HTTPS server whose certificate fails verification.
         * `false` turns verification off.
         * @default true
         */
        rejectUnauthorized?: boolean;
    });
    send<T = any>(opts: IAxiosRequestOptions, logger?: ILogger): Promise<AxiosResponse<T, any, {}, any>>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`

## `AxiosNetworkRequest`

*class*

`BaseNetworkRequest` over an `AxiosFetcher`. Defaults: JSON content type, 60000 ms `timeout`, and no rejection for status below 500 (`validateStatus`).

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
    networkOptions: Omit<AxiosRequestConfig, 'baseURL'> & {
        baseUrl?: string;
    };
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`

## `IAxiosRequestOptions`

*interface*

Request accepted by `AxiosFetcher`: an axios config where `body` is sent as the axios `data`. `rejectUnauthorized` set here overrides the instance setting for this call.

```ts
export interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
    url: string;
    method?: THttpMethod;
    params?: AnyObject;
    body?: AnyObject;
    headers?: AnyObject;
    /** Whether this call rejects an HTTPS server whose certificate fails verification; `false` turns verification off for this call. */
    rejectUnauthorized?: boolean;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`
