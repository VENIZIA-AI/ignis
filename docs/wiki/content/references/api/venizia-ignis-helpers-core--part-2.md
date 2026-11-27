---
title: "@venizia/ignis-helpers/core (2 of 4)"
description: "Every export of @venizia/ignis-helpers/core, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/core (2 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 4 of [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core).

## `IFetcherHooks`

*interface*

One function per moment; none returns a value.

```ts
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
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `IFetchExchange`

*interface*

The answer one exchange with the server gave, in the terms the pipeline needs, whichever client made it.

```ts
export interface IFetchExchange<RS> {
    response: RS;
    status: number;
    statusText: string;
    headers: Headers;
    /** Frees the socket of a body nobody will read (a redirect). */
    discard(): Promise<void>;
    /** The same answer with at most `maxBytes` of its body kept readable, the rest released: what a refused status hands back. */
    keepBody(opts: {
        maxBytes: number;
    }): Promise<RS>;
    /** The body as JSON; throws a `SyntaxError` when it is not. */
    readJson(opts: {
        maxBytes?: number;
    }): Promise<unknown>;
    /** The same answer with its body cut off at `maxBytes`. */
    capped(opts: {
        maxBytes: number;
    }): RS;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `IFetchExchangeRequest`

*interface*

One request to the network, after the hooks and the guard have had their say.

```ts
export interface IFetchExchangeRequest {
    method: string;
    url: URL;
    headers: Headers;
    body: unknown;
    signal?: AbortSignal;
    /** The addresses the guard vetted: connect to these and no other. Empty: connect as the client would. */
    addresses: string[];
    /** The host name the certificate is verified for when the connection goes to an address; unset for a literal address or a plain http url. */
    tlsServerName?: string;
    /** A proxy the guard policy chose. */
    proxy?: string;
    /** Do not follow a redirect: the pipeline reads the 3xx and walks it. */
    isManualRedirect: boolean;
    maxBytes?: number;
    /** What the call carried that is the client's own (`credentials`, `httpsAgent`, ...). */
    extra: Record<string | symbol, unknown>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `IFetchGuard`

*interface*

The seam between a fetcher, which is browser-pure, and the url guard, which resolves names with `node:dns`. The server
half is `UrlGuard`; a fetcher is handed it as `guardEngine`, so a browser bundle never reaches the resolver.

```ts
export interface IFetchGuard {
    createRoute(opts: {
        policy: IUrlSafetyPolicy;
    }): IFetchGuardRoute;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/guard.ts`

## `IFetchGuardHop`

*interface*

One hop the guard vetted: the url to send to, and the addresses to connect to (empty: connect as the client would).

```ts
export interface IFetchGuardHop {
    url: URL;
    addresses: string[];
    /** The name an https connection to `addresses` verifies the certificate for; unset for a literal address or http. */
    tlsServerName?: string;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/guard.ts`

## `IFetchGuardRoute`

*interface*

A guarded call: vets the first url and every redirect target, one hop at a time.

```ts
export interface IFetchGuardRoute {
    /** The policy's `timeout` in milliseconds, when it names one: the guard owns the duration units, so a browser bundle does not carry them. */
    readonly timeoutMs?: number;
    vet(opts: {
        url: string;
        signal?: AbortSignal;
    }): Promise<IFetchGuardHop>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/guard.ts`

## `IFetchParsed`

*interface*

What a fetcher answers when the call passes a `schema`: the parsed body beside the raw response.

```ts
export interface IFetchParsed<D, RS> {
    data: D;
    status: number;
    headers: Headers;
    response: RS;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `IFetchRequestContext`

*interface*

The request a hook sees. The url is read-only: a hook cannot send the call elsewhere, so the guard vets what is sent.

```ts
export interface IFetchRequestContext {
    readonly method: string;
    readonly url: string;
    /** Mutable: `onRequest` signs or stamps the request here. */
    readonly headers: Headers;
    /** 1 for the first attempt, then one more per retry. */
    readonly attempt: number;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `IFetchSchemaIssue`

*interface*

One place a body failed its schema: where, and which rule. Never the value found there.

```ts
export interface IFetchSchemaIssue {
    path: Array<string | number>;
    code: string;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/errors.ts`

## `IHeightWhereOptions`

*interface*

Options for `heightWhere`: the greatest depth of a node for which `predicate` holds (0 when none does).

```ts
export interface IHeightWhereOptions<T> {
    root: ITreeNode<T>;
    predicate: TNodePredicate<T>;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `IHfQueueNode`

*interface*

A handle returned by {@link HfQueueHelper.enqueue}; pass it back to {@link HfQueueHelper.cancel} to remove that entry in O(1) without scanning the queue.

```ts
export interface IHfQueueNode<T> {
    readonly value: T;
    isCancelled: boolean;
}
```

Source: `packages/helpers/src/modules/queue/internal/hf/common/types.ts`

## `IHttpRetryOptions`

*interface*

Retry settings of a call; the presence of the object turns retrying on. They are `RetryUtility.executeWithRetry`'s.

```ts
export interface IHttpRetryOptions {
    /** @default 3 */
    maxAttempts?: number;
    /** The budget across every attempt and wait, in milliseconds; a `Retry-After` that does not fit ends the retries. */
    maxTotalMs?: number;
    backoff?: IRetryBackoffOptions;
    /** Replaces the default decision (network error, timeout, 5xx and 429 retry; any other 4xx, a 3xx, a guard refusal, a schema mismatch and a caller abort do not). */
    shouldRetry?: (context: IRetryContext) => ValueOrPromise<boolean>;
    onRetry?: (context: IRetryContext & {
        nextDelayMs: number;
    }) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `IIdGeneratorOptions`

*interface*

Options for `SnowflakeUidHelper`.

```ts
export interface IIdGeneratorOptions {
    /**
     * Integer from 0 to 1023.
     *
     * @default 199
     */
    workerId?: number;
    /**
     * Milliseconds since the Unix epoch.
     *
     * @default SnowflakeConfig.DEFAULT_EPOCH
     */
    epoch?: bigint;
}
```

Source: `packages/helpers/src/modules/uid/helper.ts`

## `ILeavesOptions`

*interface*

Options for collecting leaves or non-leaves. `includePath` pairs each node with its root-to-node chain of values.

```ts
export interface ILeavesOptions<T> {
    root: ITreeNode<T>;
    includePath?: boolean;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `ILogger`

*interface*

The logging contract every consumer types against; which provider produced the logger is invisible behind it - only `factory.ts` and a provider's back-compat aliases may name a concrete logger class.

```ts
export interface ILogger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    emerg(message: string, ...args: unknown[]): void;
    log(level: TLogLevel, message: string, ...args: unknown[]): void;
    for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/common/types.ts`

## `ILoggerProvider`

*interface*

Static-side contract a provider class satisfies - WinstonLogger and PinoLogger both do.

```ts
export interface ILoggerProvider {
    get(scope: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/common/types.ts`

## `INativeFetchNetworkRequestOptions`

*interface*

Options of `NativeFetchNetworkRequest`: `RequestInit` plus `baseUrl` and `queryString`, which sets how `params` are written into every url.

```ts
export interface INativeFetchNetworkRequestOptions {
    name: string;
    networkOptions: RequestInit & {
        baseUrl?: string;
        /** How `params` are written into every url this request sends; see {@link IQueryStringOptions}. */
        queryString?: IQueryStringOptions;
    };
    defaults?: IFetcherDefaults;
    hooks?: IFetcherHooks;
    guardEngine?: IFetchGuard;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

## `INativeFetchRequestOptions`

*interface*

Request accepted by `NativeFetcher`: `RequestInit` plus `url`; `params` are written into the url query.

```ts
export interface INativeFetchRequestOptions extends TNativeRequestInit, IRequestOptions {
    url: string;
    params?: Record<string, unknown>;
    body?: RequestInit['body'] | Record<string, unknown> | unknown[];
    /** Not accepted: the body is `body`, so a `data` would be dropped. */
    data?: never;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

## `INextOpaqueUidOptions`

*interface*

`TVerdict` is what `isAvailable` returns, and it decides what `nextId` returns: a synchronous
check keeps the call synchronous, an asynchronous one makes it a promise. See the overloads on
`OpaqueUidHelper.nextId`.

```ts
export interface INextOpaqueUidOptions<TVerdict extends ValueOrPromise<boolean> = ValueOrPromise<boolean>> {
    /** Replaces the configured prefix for this call and turns it on. An empty string is refused - that is what the toggle is for. */
    prefix?: string;
    /**
     * Whether the drawn id may be used. `true` accepts it, `false` means taken and draws another.
     *
     * Named for what it RETURNS, not for the question it answers: an `exists` callback returning
     * `true` for a usable id is the sort of inverted polarity a reader gets wrong once and debugs for
     * an hour.
     *
     * An ASYNCHRONOUS check does not make an id safe. Against a database it is a read and then a
     * write with a gap in between, and another request can take the id inside that gap. It lowers the
     * collision rate; the unique index and the regenerate-on-violation insert are what remove it.
     */
    isAvailable?: (id: string) => TVerdict;
    /**
     * Draws before giving up, when `isAvailable` is supplied.
     *
     * @default DEFAULT_UID_MAX_ATTEMPTS
     */
    maxAttempts?: number;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `INextTokenUidOptions`

*interface*

Per-call options of `TokenUidHelper.nextId`.

```ts
export interface INextTokenUidOptions {
    /** Replaces the configured prefix for this call and turns it on. An empty string is refused. */
    prefix?: string;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `INodeWithPath`

*interface*

A node paired with the chain of values from the root down to (and including) itself.

```ts
export interface INodeWithPath<T> {
    node: ITreeNode<T>;
    path: T[];
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `INumericUidOptions`

*interface*

Options for generating a numeric code.

```ts
export interface INumericUidOptions {
    /**
     * Digits in the code. `10 ** length` must not exceed `2 ** 48`, so 14 at most.
     *
     * @default DEFAULT_NUMERIC_LENGTH
     */
    length?: number;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `IOpaqueUidOptions`

*interface*

Options for generating an opaque id. Every field is optional.

```ts
export interface IOpaqueUidOptions {
    /** @default { enable: false } */
    prefix?: IUidSegment;
    /**
     * Meaningless without a prefix, and refused there. Enabled without a `value`, it is {@link DEFAULT_UID_DELIMITER}.
     *
     * @default { enable: false }
     */
    delimiter?: IUidSegment;
    /**
     * Characters in the BODY. The prefix and the delimiter are not counted.
     *
     * @default DEFAULT_UID_LENGTH
     */
    length?: number;
    /**
     * Upper is the default because the default alphabet is uppercase-only, so anything else would widen it.
     *
     * @default UidCaseForms.UPPER
     */
    caseForm?: TUidCaseForm;
    /** @default UidAlphabets.CROCKFORD */
    alphabet?: string;
    /**
     * Removed from `alphabet` on top of whatever the set already drops.
     *
     * @default ''
     */
    exclude?: string;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `IPool`

*interface*

Public contract of an object pool (implemented by AbstractPoolHelper).

```ts
export interface IPool<T> {
    /** Borrow a resource (creating/waiting as needed). Single-borrower until released/discarded. */
    acquire(): Promise<T>;
    /** Return a borrowed resource to the pool (or destroy it if the pool is being torn down). */
    release(opts: {
        resource: T;
    }): void;
    /** acquire → run execution → release on success; on ANY error DISCARD (destroy) the resource + rethrow. */
    use<R>(opts: {
        execution: (resource: T) => ValueOrPromise<R>;
    }): Promise<R>;
    /** Remove a borrowed resource from the pool and destroy it. */
    discard(opts: {
        resource: T;
    }): Promise<void>;
    /** Pre-create resources up to `size` and place them idle. */
    warmup(): Promise<void>;
    /** Drain the pool: reject waiters, destroy idle resources, block new acquires. */
    destroy(): Promise<void>;
    getStats(): IPoolStats;
}
```

Source: `packages/helpers/src/modules/pool/common/types.ts`

## `IPoolControlOptions`

*interface*

Sizing/timeout knobs shared by every pool (no resource-lifecycle callbacks).

```ts
export interface IPoolControlOptions {
    /** Max number of resources the pool will hold/create. */
    size: number;
    /** Max ms to wait for a free resource; omitted → wait forever. */
    acquireTimeoutMs?: number;
    /** Max queued acquirers; omitted → unlimited. Exceeded → acquire() rejects (load-shed). */
    maxWaitingClients?: number;
    /**
     * Logger scope.
     * @default 'BasePoolHelper'
     */
    scope?: string;
}
```

Source: `packages/helpers/src/modules/pool/common/types.ts`

## `IPoolOptions`

*interface*

Options for the callback-configured {@link BasePoolHelper}: control knobs plus resource lifecycle as callbacks (AbstractPoolHelper subclasses may instead override the protected hooks directly).

```ts
export interface IPoolOptions<T> extends IPoolControlOptions {
    /** Factory to create one resource. */
    create: () => ValueOrPromise<T>;
    /** Teardown on destroy()/discard()/validate-fail/reset-fail. */
    destroy?: (resource: T) => ValueOrPromise<void>;
    /** Checked when an idle resource is about to be handed out; false → destroyed + replaced. */
    validate?: (resource: T) => ValueOrPromise<boolean>;
    /** Run on an idle resource just before hand-out (e.g. clear state). Throw → resource discarded. */
    reset?: (resource: T) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/pool/common/types.ts`

## `IPoolStats`

*interface*

Snapshot of a pool: `size` is its configured cap, `available` counts idle resources, `borrowed` those handed out, `pending` the queued acquirers.

```ts
export interface IPoolStats {
    size: number;
    available: number;
    borrowed: number;
    pending: number;
}
```

Source: `packages/helpers/src/modules/pool/common/types.ts`

## `IPoolWaiter`

*interface*

One queued acquirer. Cancellation/skip is owned by the FifoQueue; this only carries the settlers.

```ts
export interface IPoolWaiter<T> {
    resolve: (resource: T) => void;
    reject: (error: unknown) => void;
    timer: TNullable<ReturnType<typeof setTimeout>>;
}
```

Source: `packages/helpers/src/modules/pool/common/types.ts`

## `IPrintOptions`

*interface*

Options for printing a tree as text. `formatValue` renders one node's value.

```ts
export interface IPrintOptions<T> {
    root: ITreeNode<T>;
    formatValue?: (value: T) => string;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `IQueryStringOptions`

*interface*

How {@link QueryStringUtility.toQueryString} treats the values `node:querystring` has no answer for.

```ts
export interface IQueryStringOptions {
    /**
     * What a `null` or `undefined` value becomes.
     * `'skip'` leaves the pair out, `'empty'` writes `a=` (what `node:querystring` does).
     * @default 'skip'
     */
    nullish?: TQueryStringNullishMode;
    /**
     * What an object or an array value becomes.
     * `'drop'` is an empty value (an array repeats its key: what `node:querystring` does), `'json'` is one JSON-encoded parameter (`filter={"where":{}}`).
     * @default 'drop'
     */
    nested?: TQueryStringNestedMode;
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `IRedisHelper`

*interface*

Full surface of a Redis helper, composed from the command-group interfaces; `name` is the identifier it was created with.

```ts
export interface IRedisHelper extends IRedisConnection, IRedisKey, IRedisKeyValue, IRedisHash, IRedisSet, IRedisList, IRedisPubSub, IRedisJson, IRedisCommand {
    readonly name: string;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRequestOptions`

*interface*

Options every fetcher accepts. `timeout` is in milliseconds and counts per attempt; other keys pass through to the underlying client.

```ts
export interface IRequestOptions {
    url: string;
    method?: THttpMethod | (string & Record<never, never>);
    params?: Record<string, unknown>;
    /** Merged over the fetcher's default headers, header by header; a `null` or `undefined` value removes a default. */
    headers?: THttpHeaders;
    body?: unknown;
    signal?: AbortSignal;
    timeout?: number;
    /** Presence turns retrying on; replaces the fetcher's default retry whole. `{ maxAttempts: 1 }` stops it. */
    retry?: IHttpRetryOptions;
    /** Presence turns the url guard on (`{}` is the default policy). A fetcher default guard can be replaced here, never removed. */
    guard?: IUrlSafetyPolicy;
    /** The body is cut off, and the call fails, once it crosses this many bytes. */
    maxBytes?: number;
    /** Redirects followed by hand; `0` hands back the 3xx as a `UrlFetchError`. Unset: the client follows (a guard follows 3). */
    maxRedirects?: number;
    /**
     * Which statuses are an answer; any other throws a `UrlFetchError`. A list ADDS to 2xx (`[HTTP.ResultCodes.RS_4.NotFound]`
     * is 2xx or 404); a function decides alone. Unset, only 2xx.
     */
    acceptStatus?: ReadonlyArray<number> | ((status: number) => boolean);
    /** The body is parsed with it, and the call answers `{ data, status, headers, response }`. */
    schema?: z.ZodType;
    [extra: symbol | string]: unknown;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `IRetryBackoffOptions`

*interface*

Retry delay settings; every field is optional.

```ts
export interface IRetryBackoffOptions {
    /** @default RetryBackoffStrategies.EXPONENTIAL */
    strategy?: TRetryBackoffStrategy;
    /**
     * First delay in milliseconds. LINEAR adds it per attempt; EXPONENTIAL multiplies from it.
     *
     * @default 250
     */
    initialDelayMs?: number;
    /**
     * EXPONENTIAL growth factor. Ignored by other strategies.
     *
     * @default 2
     */
    multiplier?: number;
    /**
     * Upper cap in milliseconds, applied BEFORE jitter.
     *
     * @default 30_000
     */
    maxDelayMs?: number;
    /** Required when strategy is SCHEDULE; the last entry repeats for later attempts. */
    scheduleMs?: readonly number[];
    /** @default RetryJitterModes.FULL */
    jitter?: TRetryJitterMode;
}
```

Source: `packages/helpers/src/modules/retry/common/types.ts`

## `IRetryContext`

*interface*

State passed to retry callbacks: the attempt number, the error that triggered the retry and the elapsed time in milliseconds.

```ts
export interface IRetryContext {
    attempt: number;
    error: unknown;
    elapsedMs: number;
}
```

Source: `packages/helpers/src/modules/retry/common/types.ts`

## `ISnowflakeParsedId`

*interface*

The fields of a Snowflake id, as decoded from its raw `bigint`.

```ts
export interface ISnowflakeParsedId {
    raw: bigint;
    timestamp: Date;
    workerId: number;
    sequence: number;
}
```

Source: `packages/helpers/src/modules/uid/helper.ts`

## `ITokenUidOptions`

*interface*

Options for generating a secret token. Every field is optional.

```ts
export interface ITokenUidOptions {
    /**
     * Random bytes before encoding. At least `MIN_TOKEN_BYTES`.
     *
     * @default DEFAULT_TOKEN_BYTES
     */
    bytes?: number;
    /** @default UidTokenEncodings.BASE62 */
    encoding?: TUidTokenEncoding;
    /** Same rules as {@link IOpaqueUidOptions.prefix}. @default { enable: false } */
    prefix?: IUidSegment;
    /**
     * Same rules as {@link IOpaqueUidOptions.delimiter}, checked against the characters of `encoding`:
     * `_` (the default) and `-` work with `base62` and `hex`. `base64url` holds both, so with it only a
     * character outside `A-Z a-z 0-9 - _` (for example `.`) is accepted.
     *
     * @default { enable: false }
     */
    delimiter?: IUidSegment;
    /**
     * Appends a fixed-width CRC-32 of the body, GitHub-style: 6 base62 characters (`base62`) or 8 hex
     * characters (`hex`). `isWellFormed` then rejects a mistyped token without a database lookup, and a
     * secret scanner can spot the token by its shape. Refused with `base64url`, whose alphabet has no
     * fixed width to give it. The checksum covers the body only, never the prefix.
     *
     * @default false
     */
    checksum?: boolean;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `ITreeNode`

*interface*

A node produced by walking or building a tree. `children` is always an array - empty for a leaf.

```ts
export interface ITreeNode<T> {
    value: T;
    children: ITreeNode<T>[];
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `IUidSegment`

*interface*

A segment an id may or may not carry. `enable` decides; `value` survives being turned off, so a
caller can flip a configured delimiter back on without having to remember what it was.

An empty string is NOT the off switch. That conflates "no prefix" with "a prefix I have not filled
in yet", and the second one is a bug worth reporting rather than silently accepting.

```ts
export interface IUidSegment {
    enable: boolean;
    value?: string;
}
```

Source: `packages/helpers/src/modules/uid/common/types.ts`

## `IUrlSafetyPolicy`

*interface*

What a caller will accept from an untrusted url. Every field is per call: an app that must reach
plain `http` says so at the call site rather than weakening a build-time constant for everyone.

```ts
export interface IUrlSafetyPolicy {
    /**
     * The schemes a url may use.
     * @default ['https:']
     */
    allowedSchemes?: string[];
    /**
     * Whether a url may resolve to a private address. Turning it on in a path that takes urls from user input re-opens the
     * server-side request forgery this guard exists to close - a request can then be steered at
     * `169.254.169.254` and the cloud credentials behind it.
     * @default false
     */
    allowPrivateAddress?: boolean;
    /**
     * Origins the caller trusts. An origin in `trusted` passes the guard even when it resolves to a private address, so a
     * service on the internal network can be reached on purpose while every other url keeps the full guard. The request
     * still connects to the addresses that were checked, and every redirect hop is judged again. With `strict` nothing
     * outside the list passes. The cloud metadata addresses open only when the trusted origin's host IS that literal
     * address, never because a trusted host name resolves to one.
     */
    hosts?: IUrlTrustedHosts;
    /**
     * Redirects followed. Each hop is re-checked, so a public host cannot bounce into a private one.
     * @default 3
     */
    maxRedirects?: number;
    /**
     * How long a request may take. A slow host holds a worker slot for exactly this long.
     * @default UrlSafetyDefaults.TIMEOUT_MILLISECONDS
     */
    timeout?: IDuration;
    /**
     * A proxy for a guarded fetcher call (`NativeFetcher` only) to send the request through, as `http://host:port`. Off by default, and the
     * environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored: a proxy resolves the host name itself, so the vetted address
     * the guard pins to would never be used. With this set the address check still runs, but the connection is NOT pinned:
     * the proxy decides where the request goes, so only point it at a proxy you trust to refuse internal addresses.
     */
    proxy?: string;
    /**
     * Largest body, in bytes. The read stops and cancels the moment the body crosses it.
     * @default UrlSafetyDefaults.MAX_BYTES
     */
    maxBytes?: number;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/types.ts`

## `IUrlTrustedHosts`

*interface*

The origins a caller trusts, and whether it trusts nothing else.

```ts
export interface IUrlTrustedHosts {
    /**
     * Exact origins that pass whatever they resolve to: `https://cdn.example.com`, `http://vault.corp.local:8200`,
     * `http://10.0.0.5:8080`, `http://[fd00::1]`. An entry is valid only when `new URL(entry).origin === entry`, so a path,
     * a query, credentials, upper case, a trailing slash, a default port (`:443`) or an odd IP spelling
     * (`http://2130706433`) is refused with a configuration error.
     */
    trusted: TTrustedOrigin[];
    /**
     * Only the trusted origins pass; every other origin is refused, a public one included. Needs at least one trusted origin.
     * @default false
     */
    strict?: boolean;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/types.ts`

## `IUuidInspection`

*interface*

What a UUID says about itself. `createdAt` is present only for a version that carries a clock.

```ts
export interface IUuidInspection {
    version: number;
    createdAt?: Date;
}
```

Source: `packages/helpers/src/modules/uid/uuid/common/types.ts`

## `IWalkAsyncOptions`

*interface*

Options for an asynchronous breadth-first walk from `root`; `onVisit` is awaited before the node's children are queued.

```ts
export interface IWalkAsyncOptions<T> {
    root: ITreeNode<T>;
    onVisit: TOnVisitAsync<T>;
    shouldPrune?: TNodePredicate<T>;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `IWalkOptions`

*interface*

Options for a synchronous breadth-first walk from `root`.

```ts
export interface IWalkOptions<T> {
    root: ITreeNode<T>;
    onVisit: TOnVisit<T>;
    /** Returning true still visits `node` via `onVisit` - only its children are skipped from the queue, not the node itself. */
    shouldPrune?: TNodePredicate<T>;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `LoggerFactory`

*class*

The one way to get a logger, and the same everywhere: the server, a script and a browser. It names no provider: the
default is the console (`ConsoleLogger`), and an application chooses another with `use()`. It imports nothing from
node, so it is part of the browser-pure `core` entry.

```ts
export declare class LoggerFactory {
    private static cache;
    /**
     * Choose the application's provider and/or the level. A provider re-points every wrapper issued so far. The level
     * (a `LogLevels` value the application passes) is applied by the wrapper to every provider alike, and it also
     * decides whether `debug` lines are written at all: `debug` turns the gate on, anything above it turns it off,
     * whatever the environment says. A level that is not a `LogLevels` value (a typo, an uppercase name from the
     * environment) is ignored: it must never open debug.
     */
    static use(opts: {
        provider?: ILoggerProvider;
        level?: TLogLevel;
    }): void;
    /** Choose `provider` only when the application has not chosen one: a framework's startup default, never an override. */
    static useUnlessChosen(opts: {
        provider: ILoggerProvider;
    }): void;
    /** Whether an application (or a framework default through `useUnlessChosen`) has chosen a provider. */
    static isChosen(): boolean;
    /** The slot is the only record of the choice, so a `use()` or a `reset()` in any copy of the module is seen by all. */
    static currentProvider(): ILoggerProvider;
    /** Moves whenever a provider is chosen or reset, in any copy: a wrapper that cached its logger takes it again. */
    static currentGeneration(): number;
    private static bumpGeneration;
    /** The level the application set, or `undefined`: then every provider applies its own gate. */
    static currentLevel(): TLogLevel | undefined;
    /** The provider chosen by any copy of this module, if any. */
    private static sharedProvider;
    /** Back to the default provider and no level, and every wrapper takes the console again: for a test, or a host that starts over. */
    static reset(): void;
    static getLogger(scopes: string[]): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/factory.ts`

## `LogLevels`

*class*

Log severities. `ORDER` runs from most to least severe, and `isEnabled` tests a level against a threshold.

```ts
export declare class LogLevels {
    static readonly ERROR = "error";
    static readonly EMERG = "emerg";
    static readonly WARN = "warn";
    static readonly INFO = "info";
    static readonly DEBUG = "debug";
    static readonly SCHEME_SET: Set<string>;
    /** From the most to the least severe: a threshold lets through its own level and every level before it. */
    static readonly ORDER: ReadonlyArray<string>;
    static isValid(input: string): input is TLogLevel;
    /** Whether a line of `level` passes a `threshold`: `debug` lets everything through, `error` only `error` and `emerg`. */
    static isEnabled(opts: {
        level: string;
        threshold: string;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/logger/common/types.ts`

## `MIN_TOKEN_BYTES`

*const*

128 bits. Below this a token can be guessed offline, so the constructor refuses it.

```ts
export declare const MIN_TOKEN_BYTES = 16;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `MIN_UID_ALPHABET_SIZE`

*const*

Below this an `exclude` list has eaten the alphabet, and the ids stop being ids.

```ts
export declare const MIN_UID_ALPHABET_SIZE = 16;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `NativeFetcher`

*class*

Fetcher over the global `fetch` (`getWorker()`): the pipeline of `AbstractNetworkFetchableHelper` with `fetch` as the client.

```ts
export declare class NativeFetcher extends AbstractNetworkFetchableHelper<'native', INativeFetchRequestOptions, Awaited<ReturnType<typeof fetch>>, typeof fetch> {
    /** What `fetch` takes as a body as it is: encoding any of these again would change the bytes sent. */
    static isRawBody(body: unknown): body is NonNullable<RequestInit['body']>;
    private requestInit;
    private sender;
    private queryString;
    constructor(opts: {
        name: string;
        /** `RequestInit` settings for every call (`credentials`, `mode`, `cache`, ...); headers and the signal belong to `defaults` and to the call. */
        defaultConfigs?: TNativeRequestInit;
        /** Joined to a relative call url; an absolute one is sent as it is. */
        baseUrl?: string;
        defaults?: IFetcherDefaults;
        hooks?: IFetcherHooks;
        /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
        guardEngine?: IFetchGuard;
        /** What sends a request, in place of the global `fetch` (read at call time): a test double, a proxy, an instrumented client. */
        fetch?: TNativeFetchSender;
        /** How `params` are written into the url query; unset fields behave as `node:querystring` does. */
        queryString?: IQueryStringOptions;
        logger?: TFetcherLogger;
    });
    /** A standard `FormData` is encoded afresh on every send, so it can be sent again. */
    protected isReplayable(opts: {
        body: unknown;
    }): boolean;
    /** With a guard the pipeline alone picks the connection: an option that picks one is refused, per call or in `defaultConfigs`. */
    protected assertCallSupported(opts: {
        guard?: IUrlSafetyPolicy;
        extra: Record<string | symbol, unknown>;
    }): void;
    /** A raw body passes through; a plain object or an array is JSON-encoded; no body stays no body. */
    protected serializeBody(opts: {
        body: unknown;
    }): RequestInit['body'] | undefined;
    protected buildUrl(opts: {
        url: string;
        params?: Record<string, unknown>;
    }): string;
    protected describeBody(opts: {
        body: unknown;
    }): string | undefined;
    /** `fetch` over one connection to `addresses`, in order; the next one is tried only when the connection itself fails. */
    private fetchPinned;
    /** The sender the fetcher was given, or the global `fetch` looked up now (a test that swaps it is heard). */
    private request;
    /** One `fetch`: pinned to the vetted addresses when there are some and no proxy was asked for. */
    private dispatch;
    protected exchange(opts: IFetchExchangeRequest): Promise<IFetchExchange<Response>>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

## `NativeFetchNetworkRequest`

*class*

`BaseNetworkRequest` over a `NativeFetcher`. Request headers default to a JSON content type, and the caller's headers win.

```ts
export declare class NativeFetchNetworkRequest extends BaseNetworkRequest<'native'> {
    constructor(opts: INativeFetchNetworkRequestOptions);
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

## `NumericUidHelper`

*class*

Zero-padded numeric codes, uniformly distributed: `042917`. Use it for a code a human types - a
one-time password, an email verification code.

Six digits is a million codes, so a code needs an expiry and an attempt limit; the digits alone
are not the defence. For a secret that is not typed, use `TokenUidHelper`.

`10 ** length` must be an integer up to `2 ** 48` (`length` 14 at most), the range one draw covers.

```ts
export declare class NumericUidHelper extends BaseHelper {
    private readonly length;
    private readonly max;
    constructor(opts?: INumericUidOptions);
    nextId(): string;
}
```

Source: `packages/helpers/src/modules/uid/numeric.ts`

## `OpaqueUidHelper`

*class*

Fixed-length opaque ids, optionally prefixed - the counterpart to `SnowflakeUidHelper`.

OPAQUE is the difference that matters, not the randomness. A Snowflake id is TRANSPARENT: its own
`parseId()` reads back the exact millisecond it was minted and the worker that minted it. That is
what you want in a log and not what you want on an invoice. Nothing can be read out of an id from
here. The cost is the ordering, which a Snowflake gives an index for free.

`length` counts the BODY only. A prefix and a delimiter sit in front of it, so the finished string
is `prefix + delimiter + length` characters.

Read {@link DEFAULT_UID_LENGTH} before accepting the default: six characters is an airline record
locator, and it needs the same scoping and retry that airlines give one.

```ts
export declare class OpaqueUidHelper extends BaseHelper {
    private readonly alphabet;
    private readonly length;
    private readonly prefix;
    private readonly delimiter;
    constructor(opts?: IOpaqueUidOptions);
    /**
     * `prefix` replaces the configured value for this call and turns the prefix on for it; the
     * delimiter follows its own switch.
     *
     * `isAvailable` redraws until it accepts an id, up to `maxAttempts`. It LOWERS the collision rate,
     * it does not remove it: against a database the check and the insert are two statements, and
     * another request can take the id in between. The column still needs a unique index, and the
     * insert still needs to regenerate on violation.
     */
    nextId(opts?: INextOpaqueUidOptions<boolean>): string;
    nextId(opts: INextOpaqueUidOptions<Promise<boolean>>): Promise<string>;
    nextId(opts: INextOpaqueUidOptions): ValueOrPromise<string>;
    /** Entered only once a verdict came back pending; every later draw is awaited from here. */
    private continueAsync;
    private resolveHead;
    private static resolveMaxAttempts;
    /** Bounded rather than endless: repeated rejection means the space is full, and a caller waiting forever learns that far later than a caller holding this error. */
    private buildExhaustedError;
    /** The alphabet actually in use, after the case fold and every exclusion - what `length` is measured against. */
    getAlphabet(): string;
    private randomBody;
    private static hasBothCases;
    private static assertKnownCaseForm;
    /**
     * Folds case FIRST, then excludes, then de-duplicates - folding after sampling would misreport the
     * entropy and undo the alphabet's own exclusions.
     *
     * Refuses to fold a two-case alphabet at all, because folding one puts back exactly what it took
     * out: uppercasing `BASE58` turns its lowercase letters into `I` and `O`, the two it drops to keep
     * `1` and `0` unambiguous, and lowercasing it brings back `l`. Measured - the result is 35
     * characters, not the 33 an entropy calculation would predict. A single-case alphabet folds
     * cleanly because there is nothing to collide with.
     */
    private static resolveAlphabet;
}
```

Source: `packages/helpers/src/modules/uid/opaque.ts`
