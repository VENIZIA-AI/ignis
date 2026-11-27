---
title: "@venizia/ignis-helpers/core (1 of 4)"
description: "Every export of @venizia/ignis-helpers/core, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/core (1 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 4 of [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core).

## `AbstractCryptoAlgorithm`

*class*

The contract of a crypto algorithm class, with no runtime dependency beyond `BaseHelper`: no `node:*`, no
key derivation. It lives in its own file so a browser-pure class (`ECDH`, over `crypto.subtle`) can extend it
and ride `@venizia/ignis-helpers/core`. `BaseCryptoAlgorithm` (`base.algorithm.ts`, which needs
`Buffer`) extends it for the server algorithms (`AES`, `RSA`).

```ts
export declare abstract class AbstractCryptoAlgorithm<AlgorithmType extends string, EncryptInputType = unknown, DecryptInputType = unknown, SecretKeyType = unknown, EncryptReturnType = unknown, DecryptReturnType = unknown, ExtraOptions = unknown> extends BaseHelper implements ICryptoAlgorithm<AlgorithmType, EncryptInputType, DecryptInputType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions> {
    algorithm: AlgorithmType;
    abstract encrypt(opts: {
        message: EncryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): EncryptReturnType;
    abstract decrypt(opts: {
        message: DecryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): DecryptReturnType;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/abstract.algorithm.ts`

## `AbstractNetworkFetchableHelper`

*class*

The pipeline every fetcher shares: defaults, hooks, the url guard, redirects, the status check, the body cap, the
schema, retries. A concrete fetcher supplies the exchange with one client (`exchange`) and the shape of its urls and
bodies; `W` defaults to `unknown` so this stays free of `axios`.

```ts
export declare abstract class AbstractNetworkFetchableHelper<V extends TFetcherVariant, RQ extends IRequestOptions, RS, W = unknown> implements IFetchable<V, RQ, RS, W> {
    protected name: string;
    protected variant: V;
    protected worker: W;
    protected defaults: IFetcherDefaults;
    protected hooks: IFetcherHooks;
    protected guardEngine?: IFetchGuard;
    /** The base a relative call url is joined to; unset, a call url must be absolute. */
    protected baseUrl?: string;
    constructor(opts: {
        name: string;
        variant: V;
        worker?: W;
        defaults?: IFetcherDefaults;
        hooks?: IFetcherHooks;
        /** The server half of the url guard (`UrlGuard`); a call that passes `guard` needs it. */
        guardEngine?: IFetchGuard;
        /** A relative call url is joined to it (`UrlBuilder.join`: no dot segment, stays under the base); an absolute call url is sent as it is. */
        baseUrl?: string;
    });
    /** One exchange with the server: the request as the pipeline decided it, the answer in the pipeline's terms. */
    protected abstract exchange(opts: IFetchExchangeRequest, logger?: TFetcherLogger): Promise<IFetchExchange<RS>>;
    /** The url of a call with its `params` written into the query string. */
    protected abstract buildUrl(opts: {
        url: string;
        params?: Record<string, unknown>;
    }): string;
    /** Whether `body` can be sent again to a redirect target. */
    protected isReplayable(opts: {
        body: unknown;
    }): boolean;
    /** What the request log says about a body: its size or its presence, never its content. */
    protected describeBody(opts: {
        body: unknown;
    }): string | undefined;
    /** The fields of a call the pipeline would drop, with what to do instead: refused at run time for a call that is not typed (a spread, a computed key). A fetcher names more. */
    protected readonly refusedCallFields: Readonly<Record<string, string>>;
    /** Refuses a call the client cannot honour; `AxiosFetcher` refuses a guard it cannot pin. */
    protected assertCallSupported(_opts: {
        guard?: IUrlSafetyPolicy;
        extra: Record<string | symbol, unknown>;
    }): void;
    /** What each attempt needs to know of the call. */
    private resolveCall;
    /** `AbortSignal` of one attempt: the caller's own, and the attempt's deadline. */
    private attemptSignal;
    /** The body of a refused status or a mismatch is gone; the typed error carries what is left of the answer. */
    private refuseStatus;
    /** The guard's verdict on one hop: the url to send and the addresses to pin; with no guard, the target as it is. */
    private vetTarget;
    /** One attempt: hook, guard, exchange (redirects walked by hand when asked), status, cap, schema. */
    private runAttempt;
    /** The cap and the schema, once the status is accepted. */
    private finish;
    private parseUrl;
    /** The absolute target of a redirect; a `Location` that is not a url is a typed error, never a bare `TypeError`. */
    private resolveLocation;
    /** The whole call: retries around the attempts, and the one `onError` for the failure that ends it. */
    protected perform(opts: RQ & {
        schema?: z.ZodType;
    }, logger?: TFetcherLogger): Promise<TFetchSettled<RS>>;
    getProtocol(url: string): "http" | "https";
    getVariant(): V;
    getWorker(): W;
    send(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    send<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    get(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    get<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    post(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    post<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    put(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    put<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    patch(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    patch<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    delete(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    delete<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    query(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    query<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
}

/** What one call settled to, before the verb overloads give it their types. */
type TFetchSettled<RS> = RS | IFetchParsed<unknown, RS>;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `AbstractPoolHelper`

*class*

Single-borrower pool skeleton: subclasses override {@link create} (required) and optionally validateResource/resetResource/onDestroyResource. All resource-waiter pairing flows through ONE re-entrancy-guarded `dispatch()` loop; the waiter queue is {@link HfQueueHelper} - O(1), no shift/splice.

```ts
export declare abstract class AbstractPoolHelper<T> extends BaseHelper implements IPool<T> {
    protected readonly size: number;
    protected readonly acquireTimeoutMs?: number;
    protected readonly maxWaitingClients?: number;
    private readonly idle;
    private readonly borrowed;
    private readonly waiterQueue;
    private total;
    private isDispatching;
    private isDestroyed;
    constructor(opts: IPoolControlOptions);
    /** Create one resource. Required. */
    protected abstract create(): ValueOrPromise<T>;
    /** Validate an idle resource just before hand-out; false → destroyed + replaced. Default: always valid. */
    protected validateResource(_opts: {
        resource: T;
    }): ValueOrPromise<boolean>;
    /** Reset an idle resource before hand-out (e.g. clear state). Throw → resource discarded. Default: no-op. */
    protected resetResource(_opts: {
        resource: T;
    }): ValueOrPromise<void>;
    /** Tear down a resource being removed from the pool. Default: no-op. */
    protected onDestroyResource(_opts: {
        resource: T;
    }): ValueOrPromise<void>;
    getStats(): IPoolStats;
    acquire(): Promise<T>;
    release(opts: {
        resource: T;
    }): void;
    warmup(): Promise<void>;
    use<R>(opts: {
        execution: (resource: T) => ValueOrPromise<R>;
    }): Promise<R>;
    discard(opts: {
        resource: T;
    }): Promise<void>;
    destroy(): Promise<void>;
    private createResource;
    private destroyResource;
    /** Fire-and-forget dispatch with logged rejection; shared by all dispatch call sites. */
    private safeDispatch;
    /** Pair servable resources with waiting acquirers until the queue drains or the pool is exhausted. Re-entrancy-guarded so only one loop runs at a time. */
    private dispatch;
    /** Validate and reset a resource just popped from the idle list; on ANY failure destroy it and return null (caller retries). */
    private takeIdleResource;
    /** Create a fresh resource and hand it to the next waiter; on create failure, reject that waiter. */
    private createAndHand;
    /** Give a ready resource to the next live waiter; returns false and parks it in idle if the waiter raced away (e.g. timed out during an await). */
    private handToWaiter;
    /** Dequeue the next live waiter and disarm its acquire-timeout so it cannot fire after settlement. */
    private takeNextWaiter;
    private clearWaiterTimer;
}
```

Source: `packages/helpers/src/modules/pool/abstract.ts`

## `AESAlgorithms`

*class*

The ciphers `AES` supports.

```ts
export declare class AESAlgorithms extends ConstClass {
    static readonly AES_256_CBC = "aes-256-cbc";
    static readonly AES_256_GCM = "aes-256-gcm";
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.constant.ts`

## `AESAlgorithmType`

*type*

Valid AES algorithm values.

```ts
export type AESAlgorithmType = TConstValue<typeof AESAlgorithms>;
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.constant.ts`

## `BaseHelper`

*class*

Base for helpers: carries a `scope` and an `identifier`, and a `logger` scoped to both.

```ts
export declare class BaseHelper {
    scope: string;
    identifier: string;
    constructor(opts: {
        scope: string;
        identifier?: string;
    });
    /** The helper's logger, resolved on first read - a helper that never logs never builds one. */
    get logger(): ILogger;
    /** Installs one logger on this helper - a test spy, or a host overriding the factory's logger. */
    set logger(value: ILogger);
    getIdentifier(): string;
    getLogger(): ILogger;
}
```

Source: `packages/helpers/src/modules/base.ts`

## `BaseNetworkRequest`

*class*

Base of a client for one third-party HTTP API: holds the `baseUrl` and a fetcher, and builds request urls from path segments. `getRequestUrl` throws a 500 error when no base url is set.

```ts
export declare class BaseNetworkRequest<T extends TFetcherVariant> extends BaseHelper {
    protected baseUrl: string;
    protected fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>;
    constructor(opts: {
        name: string;
        baseUrl?: string;
        fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>;
    });
    /** The paths as one path: each with one leading slash. */
    getRequestPath(opts: {
        paths: Array<string>;
    }): string;
    /**
     * The url of a request: the base and the paths, checked by `UrlBuilder.join`. A path may not be a dot segment, hide one,
     * carry a backslash or a control character; a relative base is resolved against the page.
     */
    getRequestUrl(opts: {
        baseUrl?: string;
        paths: Array<string>;
    }): string;
    getNetworkService(): IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>;
    getWorker(): TFetcherWorker<T>;
}
```

Source: `packages/helpers/src/modules/network/http-request/base-network-request.helper.ts`

## `BasePoolHelper`

*class*

Concrete object pool configured by callbacks ({@link IPoolOptions}); implements the AbstractPoolHelper lifecycle hooks by delegating to `create`/`validate`/`reset`/`destroy`.

```ts
export declare class BasePoolHelper<T> extends AbstractPoolHelper<T> {
    private readonly factory;
    constructor(options: IPoolOptions<T>);
    protected create(): ValueOrPromise<T>;
    protected validateResource(opts: {
        resource: T;
    }): ValueOrPromise<boolean>;
    protected resetResource(opts: {
        resource: T;
    }): ValueOrPromise<void>;
    protected onDestroyResource(opts: {
        resource: T;
    }): ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/pool/base.ts`

## `BodyLimit`

*class*

A cap on a body, for a stream piped onward or a body read into memory. Browser-pure: streams and typed arrays only.

```ts
export declare class BodyLimit {
    /** The one refusal of a body over the cap, with its own code (`core.url_safety.body_too_large`); `detail` says how it was found (declared, received, a client's own words). */
    static refuse(opts: {
        detail: string;
    }): ApplicationError;
    /** Enforces `maxBytes` on a stream nothing reads into this process: the cap fails the stream the moment the bytes cross it. */
    static capStream(opts: {
        source: ReadableStream<Uint8Array>;
        maxBytes?: number;
    }): ReadableStream<Uint8Array>;
    /** The size a response declares, or `0` when it declares none or an unreadable one. */
    static readDeclaredLength(opts: {
        headers: Headers;
    }): number;
    /** At most `maxBytes` of the body, then the rest released; a body that fails halfway answers what arrived. Never throws on size: a refused status must still say what it was. */
    static readPrefix(opts: {
        response: Response;
        maxBytes: number;
    }): Promise<Uint8Array>;
    /** `readBytes`, decoded as UTF-8 text. */
    static readText(opts: {
        response: Response;
        maxBytes?: number;
    }): Promise<string>;
    /**
     * Reads a body that must not exceed `maxBytes`, cancelling the moment it does. `content-length` is checked first
     * because it is free, and counted anyway because it may be absent or lie.
     */
    static readBytes(opts: {
        response: Response;
        maxBytes?: number;
    }): Promise<Uint8Array>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/body-limit.ts`

## `BuildInfoRegistry`

*class*

The `globalThis` slot a build stamp lives in, PUSHED from the application entrypoint rather than
read back from disk. Same reasoning as {@link ProjectRootRegistry}: no Node import here, so a
browser Worker reaches it through `/core`, and a `bun build --compile` binary - which ships no
`node_modules`, no `.git` and no readable `package.json` - carries the value inside its own code.

```ts
export declare class BuildInfoRegistry {
    private static readonly SLOT;
    /** What a field reads when it is unknowable: the generator writes it, the health reporter falls back to it. Visible on purpose - a pipeline that forgot a variable shows up as this word, never as an absent key. */
    static readonly UNSPECIFIED = "unspecified";
    /** Called once at the entrypoint with the generated stamp; every later read sees it. */
    static set(opts: {
        buildInfo: IBuildInfo;
    }): void;
    /** The shared stamp, or `undefined` when no application registered one. */
    static get(): IBuildInfo | undefined;
    /** Drops the stamp - tests only; a host never unregisters its own build. */
    static clear(): void;
}
```

Source: `packages/helpers/src/utilities/build-info.utility.ts`

## `ConsoleLogger`

*class*

The default logger provider: it writes to the console, and it is the only provider a browser bundle reaches. It
satisfies `ILoggerProvider` (`ConsoleLogger.get(scope)`), so it is registered like Winston and Pino.

Extends AbstractLogger rather than BaseLogger because BaseLogger's module graph reads `process.env` at load.
`debug` follows the rule of the other providers (`LoggerDebugGate`): off unless `DEBUG` is set to something but a false word and the
environment is allowed, and off in a browser, which has no `process`; `LoggerFactory.use({ level })` overrides it.

```ts
export declare class ConsoleLogger extends AbstractLogger {
    private readonly scope;
    private readonly prefix;
    private constructor();
    static get(scope: string): ConsoleLogger;
    private emit;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    emerg(message: string, ...args: unknown[]): void;
    log(level: TLogLevel, message: string, ...args: unknown[]): void;
    for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/base/console.ts`

## `DEFAULT_NUMERIC_LENGTH`

*const*

Six digits is the length of a one-time code in an email or an app: 10^6 combinations, which is why it needs an expiry and an attempt limit.

```ts
export declare const DEFAULT_NUMERIC_LENGTH = 6;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `DEFAULT_TOKEN_BYTES`

*const*

32 bytes is 256 bits, the size of a SHA-256 output and of an AES-256 key: no brute force reaches it.

```ts
export declare const DEFAULT_TOKEN_BYTES = 32;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `DEFAULT_UID_DELIMITER`

*const*

Separates the prefix from the body when both are enabled. Not in any {@link UidAlphabets} set, so an id splits back apart cleanly.

```ts
export declare const DEFAULT_UID_DELIMITER = "_";
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `DEFAULT_UID_LENGTH`

*const*

Six characters of {@link UidAlphabets.CROCKFORD} is 2^30 combinations, which is an airline record
locator - and it works for the same three reasons, not because 2^30 is large:

1. SCOPED. A record locator is unique per carrier, not worldwide. Use `prefix` per entity type so
   each kind of id gets its own space.
2. RECYCLED. Airlines reuse a locator once the trip is over.
3. RETRIED. The reservation system regenerates on conflict.

Measured, so nobody has to guess: a 1% chance of at least one collision arrives at roughly 4,600
ids in ONE space, and 50% at roughly 38,000.

A `prefix` PARTITIONS the space - `INV-7K2MQ9` cannot collide with `CUS-7K2MQ9` - so each entity
type gets its own. It does NOT make an id unique inside that space, and no length does: this
generator is probabilistic by construction. The column needs a unique index, and the insert needs
to regenerate on violation rather than checking first, which races.

```ts
export declare const DEFAULT_UID_LENGTH = 6;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `DEFAULT_UID_MAX_ATTEMPTS`

*const*

Draws allowed when an `isAvailable` check keeps rejecting. Bounded rather than endless: a space with no room left would otherwise hang the caller instead of telling them.

```ts
export declare const DEFAULT_UID_MAX_ATTEMPTS = 10;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `ECDH`

*class*

ECDH P-256 key exchange with HKDF-derived AES-256-GCM session encryption. It runs in a browser or a Worker as
well as on the server: `crypto.subtle`, `btoa` and `atob` only, no `Buffer` and no `node:*`, so it rides
`@venizia/ignis-helpers/core`. Server and client both use this class and speak one wire format.

```ts
export declare class ECDH extends AbstractCryptoAlgorithm<ECDHAlgorithmType, string, IECDHEncryptedPayload, CryptoKey, Promise<IECDHEncryptedPayload>, Promise<string>, IECDHExtraOptions> {
    private static readonly encoder;
    private static readonly decoder;
    private readonly hkdfInfo;
    constructor(opts?: {
        algorithm: ECDHAlgorithmType;
        hkdfInfo?: string;
    });
    static withAlgorithm(opts?: {
        algorithm: ECDHAlgorithmType;
        hkdfInfo?: string;
    }): ECDH;
    generateKeyPair(): Promise<{
        keyPair: CryptoKeyPair;
        publicKeyB64: string;
    }>;
    importPublicKey(opts: {
        rawKeyB64: string;
    }): Promise<CryptoKey>;
    deriveAESKey(opts: {
        privateKey: CryptoKey;
        peerPublicKey: CryptoKey;
        salt?: string;
    }): Promise<{
        key: CryptoKey;
        salt: string;
    }>;
    encrypt(opts: {
        message: string;
        secret: CryptoKey;
        opts?: IECDHExtraOptions;
    }): Promise<IECDHEncryptedPayload>;
    decrypt(opts: {
        message: IECDHEncryptedPayload;
        secret: CryptoKey;
        opts?: IECDHExtraOptions;
    }): Promise<string>;
    private static toBase64;
    private static fromBase64;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`

## `ECDHAlgorithmType`

*type*

The algorithm name of `ECDH`.

```ts
export type ECDHAlgorithmType = 'ecdh-p256';
```

Source: `packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`

## `EchoUtility`

*class*

A caller's value made safe to put inside a log line or an error message. Pure string work, no node import, so it ships on `/core`.

```ts
export declare class EchoUtility {
    /**
     * What can forge or hide part of a line: C0 controls (a line break, an escape sequence), DEL and C1 controls
     * (U+0085 is a line break to some viewers), lone surrogates, the soft hyphen, the Arabic letter mark, the
     * Mongolian vowel separator, the zero-width and directional marks (U+200B-U+200F), the line and paragraph
     * separators and every bidirectional override and isolate (U+2028-U+202E, U+2060-U+206F), the byte order mark
     * (U+FEFF), the interlinear annotation marks and the Unicode tag characters. The `u` flag makes the surrogate
     * range match a LONE surrogate only; a valid pair is one character and stays.
     */
    private static readonly UNSAFE_CHARACTERS;
    /** A value JSON cannot take (a cycle, a `BigInt`) is named by its type, never thrown over: a log line must not fail. */
    private static stringify;
    private static escapeUnsafe;
    /**
     * The value as one quoted, single-line token: a string becomes `"a.txt"`, anything else its JSON. Every character
     * that can break a line or reorder what a reader sees becomes a `\uXXXX` (or `\u{XXXXX}`) escape.
     *
     * Use it for every caller-chosen value that reaches a log line (a key, a bucket, a file name, a path): hand the
     * result to a `%s`, never to a template that then adds the quotes again.
     */
    static toSafeEcho(opts: {
        value: unknown;
    }): string;
    /**
     * The value with every unsafe character escaped and nothing else changed: no quotes, and `"` and `\` stay.
     * For a caller's value inside a message that is read as text (a thrown error's message, which reaches the
     * caller and the error log), where an ordinary name must read unchanged. A value that is not a
     * string is written as `toSafeEcho` writes it.
     */
    static toSafeText(opts: {
        value: unknown;
    }): string;
}
```

Source: `packages/helpers/src/utilities/echo.utility.ts`

## `EnvironmentNames`

*class*

The environment names IGNIS recognizes, plus the two sets built from them. Pure by construction -
no `process`, no filesystem - so the browser-pure tiers can read {@link DEVELOPMENT_ENVS} without
pulling in a Node global. {@link Environment} extends this and adds the `NODE_ENV` reads.

```ts
export declare class EnvironmentNames {
    static readonly LOCAL = "local";
    static readonly DEBUG = "debug";
    static readonly DEVELOPMENT = "development";
    /** The abbreviation deployments actually write. The same environment as {@link DEVELOPMENT}. */
    static readonly DEV = "dev";
    static readonly SIT = "sit";
    static readonly UAT = "uat";
    static readonly ALPHA = "alpha";
    static readonly BETA = "beta";
    static readonly STAGING = "staging";
    static readonly PRODUCTION = "production";
    static COMMON_ENVS: Set<string>;
    /** Environments whose users are our own engineers - the only ones an error response may carry a stack trace or raw driver message. Anything else, including an unrecognized name, is sanitized as production. */
    static DEVELOPMENT_ENVS: Set<string>;
}
```

Source: `packages/helpers/src/modules/env/names.ts`

## `FetchRequestContext`

*class*

The request a hook sees, frozen so that its url, method and attempt cannot be assigned: only the headers are for the hook to change.

```ts
export declare class FetchRequestContext implements IFetchRequestContext {
    readonly method: string;
    readonly url: string;
    readonly headers: Headers;
    readonly attempt: number;
    constructor(opts: {
        method: string;
        url: string;
        headers: Headers;
        attempt: number;
    });
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/request-context.ts`

## `FetchSchemaError`

*class*

The body parsed, but it is not what the schema says: the upstream answered something else (502). The message and the
issues name paths and rules only, so no part of the body leaves with the error.

```ts
export declare class FetchSchemaError extends ApplicationError {
    /** The status the upstream answered with. */
    readonly status: number;
    readonly url: string;
    readonly issues: IFetchSchemaIssue[];
    constructor(opts: {
        status: number;
        url: string;
        issues: IFetchSchemaIssue[];
    });
    /** The error for a value the schema refused: the issues of `error` as paths and rule codes, never the value. */
    static fromZod(opts: {
        status: number;
        url: string;
        error: z.ZodError;
    }): FetchSchemaError;
    static is(error: unknown): error is FetchSchemaError;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/errors.ts`

## `FormBodyUtility`

*class*

Reads request form bodies so that a malformed body is a 400.

```ts
export declare class FormBodyUtility {
    /**
     * Reads a form body through the request's own cache, so every later reader gets the same
     * `FormData`. A body the runtime cannot parse is the caller's fault: it becomes a 400 here, where
     * the runtime's own error would be a 500 - Bun's carries only a code, Node's carries nothing.
     */
    static readFormBody(opts: {
        req: {
            formData: () => Promise<FormData>;
        };
    }): Promise<FormData>;
}
```

Source: `packages/helpers/src/utilities/form-body.utility.ts`

## `HfQueueHelper`

*class*

High-frequency, single-consumer FIFO queue with O(1) enqueue/dequeue/cancel: an array plus a moving head index (no `Array.shift()`, which is O(n)), cancellation flags the node instead of splicing, and the consumed prefix is compacted only occasionally. Not thread-safe.

```ts
export declare class HfQueueHelper<T> extends BaseHelper {
    private readonly nodes;
    private head;
    private liveCount;
    private static readonly COMPACT_THRESHOLD;
    constructor(opts?: {
        scope?: string;
    });
    /** Number of live entries (enqueued, not yet dequeued or cancelled). */
    get size(): number;
    /** Append a value and return a node handle usable to cancel it later. O(1). */
    enqueue(opts: {
        value: T;
    }): IHfQueueNode<T>;
    /** Remove + return the next live value in FIFO order, skipping cancelled nodes. Null when empty. */
    dequeue(): TNullable<T>;
    /** Mark a still-queued node cancelled so {@link dequeue} and {@link size} skip it. Idempotent. O(1). */
    cancel(opts: {
        node: IHfQueueNode<T>;
    }): void;
    /** Remove and return every remaining LIVE value in FIFO order (e.g. on shutdown), emptying the queue. */
    drain(): T[];
    private reset;
}
```

Source: `packages/helpers/src/modules/queue/internal/hf/helper.ts`

## `HttpBodies`

*class*

Tests a body against runtime classes by name.

```ts
export declare class HttpBodies {
    /**
     * Whether `body` is an instance of one of the global classes `names`. A constructor is looked up on `globalThis` so a
     * runtime without one (no `FormData`) never matches it, and the `Object.prototype.toString` tag catches the same kind of
     * object from another realm or a polyfill, where `instanceof` is false.
     */
    static isAnyOf(opts: {
        body: unknown;
        names: ReadonlyArray<string>;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/utilities.ts`

## `HttpHeaders`

*class*

Header maps: merged per header, the call winning, a `null` or `undefined` value removing a header.

```ts
export declare class HttpHeaders {
    /** The headers of `layers` in order, later layers over earlier ones, as one `Headers`. */
    static merge(opts: {
        layers: ReadonlyArray<TNullable<THttpHeaders>>;
    }): Headers;
    /** `merge` under a JSON content type: the layers may replace it (any case) or remove it with `null`. */
    static withJsonDefault(opts: {
        layers: ReadonlyArray<TNullable<THttpHeaders>>;
    }): Headers;
    /**
     * `headers` for a call with `body`: the JSON default content type is dropped when the runtime describes the body itself,
     * so it sets the multipart boundary or the right type. A content type the call names wins and stays.
     */
    static forBody(opts: {
        headers: Headers;
        call: THttpHeaders | undefined;
        body: unknown;
    }): Headers;
    /** A copy of `headers` keeping only the names in `names`. */
    static only(opts: {
        headers: Headers;
        names: ReadonlyArray<string>;
    }): Headers;
    /** A copy of `headers` without the names in `names`. */
    static without(opts: {
        headers: Headers;
        names: ReadonlyArray<string>;
    }): Headers;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/utilities.ts`

## `HttpRedirects`

*class*

The redirect rules of a fetcher that walks redirects by hand.

```ts
export declare class HttpRedirects {
    /** Request headers that name the body; they go when a redirect turns the request into a GET. */
    static readonly BODY_HEADERS: ReadonlyArray<string>;
    /**
     * The only caller headers a cross-origin redirect keeps. Every other one is dropped: a tenant's webhook secret
     * (`x-api-key`, a signature) must not follow a redirect to a host that tenant did not name.
     */
    static readonly CROSS_ORIGIN_HEADERS: ReadonlyArray<string>;
    static isRedirect(opts: {
        status: number;
    }): boolean;
    /** 303, and a POST answered 301 or 302, continue as a GET without the body. */
    static becomesGet(opts: {
        status: number;
        method: string;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/utilities.ts`

## `HttpResponseReader`

*class*

What an IGNIS server answers - `Content-Range`, the error envelope - read once, here, for every
client of that server: the http connector, and a client that reads it without the connector.

```ts
export declare class HttpResponseReader {
    /** A content type that names JSON: `application/json`, `application/problem+json`, `application/ld+json`. */
    static readonly JSON_CONTENT_TYPE_PATTERN: RegExp;
    /** An empty string reads as absent, so a fallback still applies. */
    private static toText;
    /**
     * A `Content-Range` header as the IGNIS server writes it: `records 0-24/137` -> skip 0, total 137;
     * an empty page, `records *\/137` -> total 137. Anything else, including an absent header or an
     * unknown total, is `undefined`.
     */
    static parseContentRange(opts: {
        header?: string | null;
    }): {
        skip?: number;
        total: number;
    } | undefined;
    /**
     * The IGNIS error envelope - `{ message, statusCode, normalized: { text, code, args }, requestId,
     * extra, details }` - read off a parsed response body. A server configured with `error.rootKey`
     * wraps it under that key; pass the same `rootKey` to unwrap it. A body without that key, or with a
     * non-object under it (a proxy's `{ error: 'Bad Gateway' }`), is read as it stands.
     *
     * A body that is not a plain object yields `{}`; any other body yields its known fields, each
     * `undefined` when absent or mistyped. An empty string reads as absent.
     */
    static readErrorEnvelope(opts: {
        body: unknown;
        rootKey?: string;
    }): TResponsedError;
    /** A failed response's envelope. A body that is not JSON yields `{}`, and the status alone still describes it. */
    static readError(opts: {
        response: Response;
        rootKey?: string;
    }): Promise<TResponsedError>;
    /**
     * A failed response as the error the server threw: its status, code, args and text, and its
     * `extra` with the `requestId` added. `message` is `context` plus the server's text, for logs; without
     * `context` it is the server's text alone (`HTTP <status>` when it sent none), for a client that shows
     * `message` to users. `normalized.text` is the server's either way - `HTTP <status>` when none.
     * `cause` is the server's `details.cause` - a 422's per-field issues, `{ path, message, code }`.
     *
     * `requestId` names the request this client made. A relaying server's `extra` carries the id of
     * the request it made upstream: it joins `upstreamRequestIds`, nearest first, at every hop.
     */
    static toApplicationError(opts: {
        response: Response;
        /** Where it failed, for logs - e.g. `[HttpDataSource][read] 404 | /tickets`. Left out, `message` is the server's text. */
        context?: string;
        rootKey?: string;
    }): Promise<ApplicationError>;
    /**
     * `toApplicationError` for a fetcher's refused answer: it reads the body the `UrlFetchError` kept (the first 64 KiB),
     * and an error that carries none is described by its status alone.
     */
    static fromFetchError(opts: {
        error: UrlFetchError<Response>;
        context?: string;
        rootKey?: string;
    }): Promise<ApplicationError>;
    /** The body as text: `''` for a 204, an empty body or no body; with `maxBytes` the read stops and fails at the cap. */
    static readText(opts: {
        response: Response;
        maxBytes?: number;
    }): Promise<string>;
    /**
     * The body of a success answer, by what it says it is: `null` for a 204 or an empty body, the parsed
     * value when the content type names JSON (`application/json`, `application/problem+json`), the text itself
     * for any other type (`text/plain`, `text/csv`). A body that claims JSON and is not is a `502` that names
     * `context` (where it happened, e.g. `[Client][read] 200 | /tickets`), its size and its content type; its
     * content stays out of the message, which a relaying server may pass to its own clients.
     */
    static readBody(opts: {
        response: Response;
        context: string;
    }): Promise<TJsonValue>;
    /**
     * A download as a file: its `blob`, the `filename` of its `Content-Disposition` (`filename*` first) and its `contentType`.
     * A non-2xx answer throws what `toApplicationError({ response })` throws, so an error page is never saved as a file.
     */
    static readFile(opts: {
        response: Response;
    }): Promise<{
        blob: Blob;
        filename?: string;
        contentType?: string;
    }>;
    /**
     * The body as JSON whatever its content type says, `null` for a 204 or an empty body: for a route that
     * answers JSON under a type a proxy rewrote. Errors as `readBody` does.
     */
    static readJson(opts: {
        response: Response;
        context: string;
    }): Promise<TJsonValue>;
    private static parseJson;
    /**
     * A body the server marked with `x-response-extra` carries `extra` beside its rows. `body` is what
     * the route answers without extras: the `{ count, data }` envelope when the count was asked for in
     * the body, the rows otherwise. Any other body is returned as it stands - an unmarked object is
     * never unwrapped, so a row that has `data` and `extra` columns of its own is never misread.
     */
    static readExtra(opts: {
        body: unknown;
        headers: Pick<Headers, 'has'>;
    }): {
        body: unknown;
        extra?: Record<string, unknown>;
    };
    /**
     * Reads a filename out of a `Content-Disposition` value.
     *
     * Three forms, in the order the RFC gives them precedence: `filename*=UTF-8''...` or `filename*=ISO-8859-1''...`
     * (percent-encoded, and the one hand-rolled parsers miss; another charset falls through), a quoted `filename="..."`, and a bare `filename=...`.
     * Splitting on `filename=` alone returns the percent-encoded bytes for any non-ASCII name, which in
     * a product with non-English filenames is most of them.
     *
     * The pair of `RequestUtility.buildContentDispositionHeader`: one writes the header, this one reads it.
     */
    static parseContentDisposition(opts: {
        header: TNullable<string>;
    }): {
        type?: string;
        filename?: string;
    };
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/response-reader.ts`

## `HttpRetry`

*class*

What a retried call retries, and for how long a server asks it to wait.

```ts
export declare class HttpRetry {
    /** The longest wait a call takes between two attempts unless `backoff.maxDelayMs` says otherwise; the retry helper's own default. */
    static readonly DEFAULT_MAX_DELAY_MS = 30000;
    /**
     * The default decision: a network error, a timeout, a 5xx and a 429 are worth another attempt. Any other 4xx, a 3xx, a
     * url the guard refused (refused forever), a schema mismatch and a caller's own abort are not.
     */
    static isRetryable(opts: {
        error: unknown;
        signal?: AbortSignal;
    }): boolean;
    /** The wait a 429 or 503 asks for in `Retry-After`, in milliseconds: seconds, or an HTTP date. `undefined` when there is none. */
    static readRetryAfterMs(opts: {
        error: unknown;
        now?: number;
    }): number | undefined;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/utilities.ts`

## `HttpStatus`

*class*

Which statuses a fetcher takes as an answer.

```ts
export declare class HttpStatus {
    /** Whether `status` is 2xx. */
    private static isSuccess;
    /** The one place `acceptStatus` becomes a decision: a list adds to 2xx, a function replaces it, unset is 2xx. */
    static toPredicate(opts: {
        accept: ReadonlyArray<number> | ((status: number) => boolean) | undefined;
    }): (status: number) => boolean;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/utilities.ts`

## `IBuildInfo`

*interface*

What a build stamps about itself. Every field optional: a host that never ran the generator still
answers, with the fields it does know.

```ts
export interface IBuildInfo {
    service?: string;
    version?: string;
    commit?: string;
    branch?: string;
    builtAt?: string;
}
```

Source: `packages/helpers/src/utilities/build-info.utility.ts`

## `IBuildOptions`

*interface*

Options for building a tree from `rootValue` by repeatedly calling `getChildren`.

```ts
export interface IBuildOptions<T> {
    rootValue: T;
    getChildren: (value: T) => ValueOrPromise<T[]>;
    /**
     * Identity for detecting repeats across the whole build, not just the current branch. A repeated
     * key skips that branch without throwing - legitimate diamonds (shared descendants) are not cycles.
     */
    getKey: (value: T) => unknown;
}
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `IECDHEncryptedPayload`

*interface*

An `ECDH` ciphertext: `iv` and `ct` (ciphertext) are both base64 strings.

```ts
export interface IECDHEncryptedPayload {
    iv: string;
    ct: string;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`

## `IECDHExtraOptions`

*interface*

AES-GCM options for `ECDH` `encrypt` and `decrypt`. `additionalData` is authenticated but not encrypted; `decrypt` must receive the same string or it fails. An empty string is ignored.

```ts
export interface IECDHExtraOptions {
    additionalData?: string;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`

## `IFetchable`

*interface*

Contract of an HTTP fetcher: `send` takes the method from the options, the verb methods fix it, and `getWorker` returns the underlying client (`W`). Without a `schema` a call answers the raw response `RS`; with one, `IFetchParsed`.

```ts
export interface IFetchable<V extends TFetcherVariant, RQ extends IRequestOptions, RS, W = unknown> {
    send(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    send<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    get(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    get<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    post(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    post<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    put(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    put<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    patch(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    patch<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    delete(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    delete<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    query(opts: RQ & {
        schema?: undefined;
    }, logger?: TFetcherLogger): Promise<RS>;
    query<S extends z.ZodType>(opts: RQ & {
        schema: S;
    }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
    getVariant(): V;
    getWorker(): W;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `IFetcherDefaults`

*interface*

What a fetcher applies to every call unless the call says otherwise.

```ts
export interface IFetcherDefaults {
    /** Per attempt, in milliseconds. */
    timeout?: number;
    headers?: THttpHeaders;
    retry?: IHttpRetryOptions;
    maxBytes?: number;
    /** A call may replace this policy with its own; it cannot switch the guard off. */
    guard?: IUrlSafetyPolicy;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`
