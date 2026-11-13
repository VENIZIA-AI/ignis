---
title: "@venizia/ignis-helpers/core"
description: "Every export of @venizia/ignis-helpers/core, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/core`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

111 exports, 111 with TSDoc. 59 more are re-exported from other entries (listed at the end).

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

`W` defaults to `unknown` so this stays free of `axios` - a concrete fetcher binds it to its real worker type (`AxiosInstance`, `typeof fetch`), which is then inherited on `this.worker` with no override needed.

```ts
export declare abstract class AbstractNetworkFetchableHelper<V extends TFetcherVariant, RQ extends IRequestOptions, RS, W = unknown> implements IFetchable<V, RQ, RS, W> {
    protected name: string;
    protected variant: V;
    protected worker: W;
    constructor(opts: {
        name: string;
        variant: V;
        worker?: W;
    });
    abstract send(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    getProtocol(url: string): "http" | "https";
    getVariant(): V;
    getWorker(): W;
    get(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    post(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    put(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    patch(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    delete(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    query(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
}
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
    /** Pop an idle resource and validate+reset it; on ANY failure destroy it and return null (caller retries). */
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
export declare class AESAlgorithms {
    static readonly AES_256_CBC = "aes-256-cbc";
    static readonly AES_256_GCM = "aes-256-gcm";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.constants.ts`

## `AESAlgorithmType`

*type*

Valid AES algorithm values.

```ts
export type AESAlgorithmType = TConstValue<typeof AESAlgorithms>;
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.constants.ts`

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
    getRequestPath(opts: {
        paths: Array<string>;
    }): string;
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
`debug` follows the rule of the other providers (`LoggerDebugGate`): off unless `DEBUG` is truthy and the
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

Contract of an HTTP fetcher: `send` takes the method from the options, the verb methods fix it, and `getWorker` returns the underlying client (`W`).

```ts
export interface IFetchable<V extends TFetcherVariant, RQ extends IRequestOptions, RS, W = unknown> {
    send(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    get(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    post(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    put(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    patch(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    delete(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    query(opts: RQ, logger?: TFetcherLogger): Promise<RS>;
    getVariant(): V;
    getWorker(): W;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

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

## `INodeFetchNetworkRequestOptions`

*interface*

Options of `NodeFetchNetworkRequest`: `RequestInit` plus `baseUrl` and `queryString`, which sets how `params` are written into every url.

```ts
export interface INodeFetchNetworkRequestOptions {
    name: string;
    networkOptions: RequestInit & {
        baseUrl?: string;
        /** How `params` are written into every url this request sends; see {@link IQueryStringOptions}. */
        queryString?: IQueryStringOptions;
    };
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`

## `INodeFetchRequestOptions`

*interface*

Request accepted by `NodeFetcher`: `RequestInit` plus `url`; `params` are written into the url query.

```ts
export interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
    url: string;
    method?: THttpMethod;
    params?: AnyObject;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`

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
     * @default QueryStringNullishModes.EMPTY
     */
    nullish?: TQueryStringNullishMode;
    /**
     * What an object or an array value becomes.
     * @default QueryStringNestedModes.DROP
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

Options every fetcher accepts. `timeout` is in milliseconds; other keys pass through to the underlying client.

```ts
export interface IRequestOptions {
    url: string;
    method?: THttpMethod;
    params?: AnyObject;
    timeout?: number;
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
    /** When set, nothing outside the list passes, whatever it resolves to. */
    allowedHosts?: string[];
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
     * A proxy for `UrlIngest.fetchGuarded` to send the request through, as `http://host:port`. Off by default, and the
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
    static isValid(input: string): boolean;
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

## `NodeFetcher`

*class*

Fetcher over the global `fetch` (`getWorker()`). `timeout` (milliseconds) aborts the request and is combined with a `signal` the caller passes.

```ts
export declare class NodeFetcher extends AbstractNetworkFetchableHelper<'node-fetch', INodeFetchRequestOptions, Awaited<ReturnType<typeof fetch>>, typeof fetch> {
    private defaultConfigs;
    private queryString;
    constructor(opts: {
        name: string;
        defaultConfigs: RequestInit;
        /** How `params` are written into the url; unset fields behave as `node:querystring` does. */
        queryString?: IQueryStringOptions;
        logger?: TFetcherLogger;
    });
    /** A raw body passes through; a plain object or an array is JSON-encoded; no body stays no body. */
    protected serializeBody(opts: {
        body: unknown;
    }): RequestInit['body'] | undefined;
    send(opts: INodeFetchRequestOptions, logger?: TFetcherLogger): Promise<Response>;
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`

## `NodeFetchNetworkRequest`

*class*

`BaseNetworkRequest` over a `NodeFetcher`. Request headers default to a JSON content type, and the caller's headers win.

```ts
export declare class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'> {
    constructor(opts: INodeFetchNetworkRequestOptions);
}
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`

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

## `ParseUtility`

*class*

Number, string and key conversions that tolerate bad input; no node import, so it ships on `/core`.

````ts
export declare class ParseUtility {
    /**
     * Rounds at a decimal precision, shifting the exponent rather than multiplying: `1.005` at 2 is
     * `1.01` here, where `Math.round(1.005 * 100) / 100` gives `1`.
     *
     * Hand-written to keep lodash out of a browser bundle. One deliberate difference from `lodash/round`:
     * a result of negative zero is normalised to `0`. They compare equal, stringify the same and
     * serialise the same, so nothing downstream can tell - checked across 114 value/precision pairs, and
     * the sign of zero was the only disagreement.
     */
    private static round;
    /** Arrays stay arrays - mapping one through the object branch would turn it into an index-keyed object - but their object elements still need their keys camelized. Dates are opaque values. */
    private static camelizeValue;
    /**
     * Ten uppercase base36 characters (`0-9A-Z`) from the platform CSPRNG, about 51 bits. Two draws of
     * five characters, because one draw covers at most `2 ** 48` and ten base36 characters need more.
     * A throwaway key for a test or a label, not a secret: use `TokenUidHelper` for a secret.
     */
    static getUID(): string;
    static toCamel(opts: {
        input: string;
    }): string;
    static keysToCamel(opts: {
        source: object;
    }): Record<string, unknown>;
    static isInt(opts: {
        input: unknown;
    }): boolean;
    static isFloat(opts: {
        input: unknown;
    }): boolean;
    /**
     * Parses an integer, TOTAL by design: it always answers a number, and answers `0` for anything it
     * cannot parse - `undefined`, `''`, `'abc'`.
     *
     * That makes `ParseUtility.toInt({ input }) ?? fallback` dead code, because the left side is never
     * nullish. The fallback belongs INSIDE the call, and for an environment read it belongs in the read
     * itself:
     *
     * ```ts
     * ParseUtility.toInt({ input: applicationEnvironment.get(KEY, { defaultValue: '6379' }) })  // correct
     * ParseUtility.toInt({ input: applicationEnvironment.get(KEY) }) ?? 6379                    // always 0 when KEY is unset
     * ```
     *
     * The second form is silent: a missing port reads `0` and a missing retry budget reads `0`, which
     * through `AbstractRedisHelper.buildRetryStrategy` means "give up after the first failure".
     */
    static toInt(opts: {
        input: unknown;
    }): number;
    static toFloat(opts: {
        input: unknown;
        digit?: number;
    }): number;
    static toBoolean(opts: {
        input: unknown;
    }): boolean;
    /** Converts an array to a Map keyed by `key`. Last element wins on duplicate keys. */
    static parseArrayToMapWithKey<T extends Record<K, PropertyKey>, K extends keyof T>(opts: {
        items: T[];
        key: K;
    }): Map<T[K], T>;
    /** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped env values (e.g. `applicationEnvironment.get(KEY, { transform: (input) => ParseUtility.toDelimitedArray({ input }) })`). */
    static toDelimitedArray(opts: {
        input: unknown;
        separator?: string;
    }): string[];
    /**
     * A trimmed value, or `undefined` when the input is absent or carries nothing but whitespace.
     *
     * Written for environment reads. `KEY=` in a deployment file is a pipeline that forgot to export the
     * value, but `process.env.KEY` answers `''` for it, and `''` walks straight past `??`:
     *
     * ```ts
     * process.env.APP_ENV_LOGGER_FORMAT ?? 'text'                                           // '' when the line is blank
     * ParseUtility.blankToUndefined({ input: process.env.APP_ENV_LOGGER_FORMAT }) ?? 'text' // 'text'
     * ```
     *
     * Reach for this rather than `||`, which reads `'0'` as blank as well.
     */
    static blankToUndefined(opts: {
        input: string | undefined;
    }): string | undefined;
    /** Trims a possibly-undefined env value to a clean string ('' when absent). */
    static toTrimmed(opts: {
        input: unknown;
    }): string;
    /** Traverse a dotted property path on an object. */
    static getDeepProperty<T, V>(opts: {
        source: T;
        path: string;
    }): V;
}
````

Source: `packages/helpers/src/utilities/parse.utility.ts`

## `PerformanceUtility`

*class*

Timing helpers on `performance.now()`: checkpoints, elapsed milliseconds and a measured task runner.

```ts
export declare class PerformanceUtility {
    static getCheckpoint(): number;
    static getExecuted(opts: {
        from: number;
        digit?: number;
    }): number;
    static executeWithMeasure<R>(opts: {
        logger?: ILogger;
        level?: string;
        description?: string;
        args?: unknown;
        scope: string;
        task: () => R | Promise<R>;
    }): Promise<R>;
}
```

Source: `packages/helpers/src/utilities/performance.utility.ts`

## `ProjectRootRegistry`

*class*

The `globalThis` slot an application's project root lives in, shared across every copy of this
package - a process (or a compiled bundle) can carry two, and a root set through one copy must be
found by the other. No Node import here on purpose: `ModuleUtility` delegates to this file, and so
does a browser Worker host through the `/core` sub-path - either would bundle a module-level Node
specifier straight into a host that cannot resolve it.

```ts
export declare class ProjectRootRegistry {
    private static readonly SLOT;
    /** Called by an application once it knows its root; every peer lookup that follows resolves against it. */
    static set(opts: {
        projectRoot: string;
    }): void;
    /** The shared root, or `undefined` until an application sets it - never a `process.cwd()` fallback here, so a host with no `process` never needs one. */
    static getShared(): string | undefined;
}
```

Source: `packages/helpers/src/utilities/project-root.utility.ts`

## `PromiseUtility`

*class*

Waiting, bounded concurrency and fire-and-forget. `voidExecution` is not a `BaseHelper` member: TS cannot emit protected members on an exported ANONYMOUS class (TS4094), which is what factory-built controllers return; a static on a separate class has no such limit.

```ts
export declare class PromiseUtility {
    /** The longest delay a timer takes (a signed 32-bit integer of milliseconds); a larger one fires after 1 ms. */
    private static readonly MAX_TIMER_MS;
    static sleep(opts: {
        ms: number;
    }): Promise<void>;
    /**
     * Runs `call` and resolves with its result, or rejects with an `ApplicationError` when `timeoutMs` passes first
     * (`message` is the error text; the default names the limit). The timer is cleared on every path - the call wins,
     * the timeout wins, the call throws - so none is left behind. The call's own rejection passes through unchanged.
     * The losing call keeps running: a promise cannot be cancelled. The timeout error carries status 504 (Gateway
     * Timeout). `timeoutMs` must be a positive number no larger than `2_147_483_647` (the most a timer takes: a larger
     * one fires at once), else this rejects without running `call`.
     */
    static withTimeout<T>(opts: {
        call: () => ValueOrPromise<T>;
        timeoutMs: number;
        message?: string;
    }): Promise<T>;
    /** Execute async tasks with bounded concurrency. */
    static executeWithLimit<T>(opts: {
        tasks: Array<TTask<T>>;
        limit: number;
        onTaskDone?: <R>(opts: {
            result: R;
        }) => ValueOrPromise<void>;
    }): Promise<Awaited<T>[]>;
    /** Fire-and-forget: routes rejection to `logger` (or console.error), passes sync results through untouched. */
    static voidExecution(opts: {
        logger?: ILogger;
        scope: string;
        execution: ValueOrPromise<unknown>;
    }): void;
}
```

Source: `packages/helpers/src/utilities/promise.utility.ts`

## `QueryStringNestedModes`

*class*

What an object or an array value becomes.

```ts
export declare class QueryStringNestedModes {
    /** An empty value (an array repeats its key instead): what `node:querystring` does. */
    static readonly DROP = "drop";
    /** One JSON-encoded parameter (`ids=[1,2]`, `filter={"where":{}}`), the shape a JSON filter travels in. */
    static readonly JSON = "json";
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `QueryStringNullishModes`

*class*

What a `null` or `undefined` value becomes.

```ts
export declare class QueryStringNullishModes {
    /** An empty value (`a=`): what `node:querystring` does. */
    static readonly EMPTY = "empty";
    /** The pair is left out. */
    static readonly SKIP = "skip";
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `QueryStringSeparators`

*class*

The punctuation of a query string, named so a reader sees the role rather than the character.

```ts
export declare class QueryStringSeparators {
    /** Between the path and the first pair. */
    static readonly START = "?";
    /** Between two pairs. */
    static readonly PAIR = "&";
    /** Between a name and its value. */
    static readonly ASSIGN = "=";
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `QueryStringUtility`

*class*

Builds a query string without a node builtin, so the network layer stays browser-safe.

```ts
export declare class QueryStringUtility {
    /**
     * `node:querystring`'s `stringify`, written out so nothing on the HTTP path carries a node builtin -
     * that one import is what kept the whole network layer out of a browser bundle.
     *
     * Not `new URLSearchParams(params).toString()`, which differs on four counts measured against the
     * original: an array becomes `a=1%2C2` instead of `a=1&a=2`, `undefined` and `null` become the
     * STRINGS "undefined" and "null" instead of an empty value, and a space encodes as `+` rather than
     * `%20`. The first changes what a server parses; the second is the same coercion that sends a header
     * reading "undefined".
     *
     * Diffed against `node:querystring` across 22 shapes with zero mismatches.
     *
     * `nullish: 'skip'` leaves a null or undefined pair out. `nested: 'json'` sends an object or an
     * array as ONE JSON parameter instead (an array does not repeat its key), so a filter object survives
     * the trip. Without them the behavior is the one above.
     */
    static toQueryString(opts: {
        params: AnyObject;
    } & IQueryStringOptions): string;
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `RecordUtility`

*class*

Narrowing of an `unknown` value, such as a wire payload, to an object whose string keys can be read, and a safe deep read of one; no node import, so it ships on `/core`.

```ts
export declare class RecordUtility {
    /** A non-null object, arrays included: the narrowest check before reading string keys off an `unknown`. A type guard, so it keeps its positional `value`. */
    static isRecord(value: unknown): value is Record<string, unknown>;
    /** A non-null object that is not an array: `isRecord` without the arrays. A class instance (an `Error`, a `Date`) passes; there is no prototype check; use `isPlainObject` for that. */
    static isPlainRecord(value: unknown): value is Record<string, unknown>;
    /**
     * A non-null object whose prototype is exactly `Object.prototype` or `null`: an object literal, `JSON.parse` output,
     * `Object.create(null)`. Where `isRecord` and `isPlainRecord` look only at the type of the value, this one reads the
     * prototype, so an array, a class instance (an `Error`, a `Date`, a `Map`), a function and an object from another
     * realm (its `Object.prototype` is not this realm's) answer `false`. `Object.create(Object.create(null))` also
     * answers `false`: its prototype is an object, not `null`. Use it for input that must be literal-shaped (a JSON
     * body, a config). It never throws: a Proxy whose `getPrototypeOf` trap throws answers `false`.
     */
    static isPlainObject(value: unknown): value is Record<string, unknown>;
    /**
     * Reads `value` along `path` (an array of keys; a number reads an array index) and answers `undefined` when any step
     * is missing, null or not an object, where `ParseUtility.getDeepProperty` throws. Only own properties are read: a
     * name such as `__proto__`, `constructor` or `toString` is never found through the prototype, so a path taken from
     * input cannot reach the prototype chain. An empty `path` answers `value` itself. The answer is `unknown`: narrow it.
     */
    static read(opts: {
        value: unknown;
        path: ReadonlyArray<string | number>;
    }): unknown;
}
```

Source: `packages/helpers/src/utilities/record.utility.ts`

## `RequestBodyErrors`

*const*

The one definition of a body the runtime cannot parse; the kernel's `RequestErrors.BODY_MALFORMED` is this object.

```ts
export declare const RequestBodyErrors: {
    readonly BODY_MALFORMED: {
        readonly message: {
            readonly text: "Malformed body payload";
            readonly code: "core.request.body_malformed";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly TOO_MANY_FILES: {
        readonly message: {
            readonly text: "Too many files in one request";
            readonly code: "core.request.too_many_files";
        };
        readonly statusCode: 413;
        readonly category: "validation";
    };
};
```

Source: `packages/helpers/src/utilities/form-body.utility.ts`

## `RequestIdGenerator`

*class*

The correlation id every IGNIS host stamps on a request, so a server, a browser Worker and the
page calling it cannot drift into different formats. A UUID version 4 - random, no clock to
correlate a caller by - drawn through {@link UuidHelper}.

Never `crypto.randomUUID()` on its own, which is `hono/request-id`'s default: browsers gate that
one API on a SECURE CONTEXT. Measured in Chrome - on `http://<lan-ip>` both the page and a Worker
report `crypto` present and `getRandomValues` working, while `randomUUID` and `subtle` are
`undefined` and the call throws `TypeError`. On `http://localhost` (a secure origin) all four are
there. So the gate follows the ORIGIN, not the worker: testing from a phone over the LAN is
enough to lose it. `UuidHelper.v4()` rebuilds the identical shape from `getRandomValues`, which
carries no such gate - a log pipeline cannot tell the two paths apart.

```ts
export declare class RequestIdGenerator extends BaseHelper {
    private readonly uuid;
    constructor(opts?: {
        scope?: string;
    });
    nextId(): string;
}
```

Source: `packages/helpers/src/modules/uid/request-id.ts`

## `RetryBackoffStrategies`

*class*

How the retry delay grows between attempts.

```ts
export declare class RetryBackoffStrategies {
    static readonly FIXED = "fixed";
    static readonly LINEAR = "linear";
    static readonly EXPONENTIAL = "exponential";
    /** An explicit per-attempt cap schedule, e.g. [250, 1000, 4000]; the last entry repeats. */
    static readonly SCHEDULE = "schedule";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TRetryBackoffStrategy;
}
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `RetryHelper`

*class*

Static members call each other through the class name (`RetryHelper.xxx`), never `this` - a
detached static method loses its `this` binding.

```ts
export declare class RetryHelper extends BaseHelper {
    private static readonly RETRY_TIMEOUT_MARKER;
    /** True when `error` is a per-attempt timeout raised by `runWithTimeout`/`executeWithRetry`. */
    static isRetryTimeoutError(error: unknown): boolean;
    private static buildTimeoutError;
    private static throwIfAborted;
    /** `sleep` that wakes up early (and rejects) when `signal` aborts mid-wait. */
    private static sleepWithSignal;
    /** Races `execution` against `timeoutMs` (`<= 0`/omitted = no timeout). The losing execution keeps running - JS promises cannot be cancelled - so pass `signal` through for cooperative cancellation. */
    static runWithTimeout<T>(opts: {
        operation: string;
        timeoutMs?: number;
        execution: () => ValueOrPromise<T>;
    }): Promise<T>;
    /** The pre-jitter delay for `attempt` (1-based, i.e. the delay AFTER attempt N failed). */
    static computeBackoffDelayMs(opts: {
        attempt: number;
        backoff?: IRetryBackoffOptions;
    }): number;
    /** One `executeWithRetry` attempt and everything that follows a failure: `shouldRetry` refusing rethrows, otherwise the bounds are checked and - when another attempt is allowed - the retry is logged, `onRetry` awaited and the backoff slept, all before returning. */
    private static runRetryAttempt;
    /** Retries `execution` with backoff, bounded by `maxAttempts`/`maxTotalMs`. JS cannot cancel a running promise - `signal` only stops between attempts/sleeps, so a timed-out execution keeps running unless it honors the signal itself. */
    static executeWithRetry<T>(opts: {
        signal?: AbortSignal;
        logger?: ILogger;
        operation: string;
        /** @default 3 */
        maxAttempts?: number;
        /** Total budget across attempts AND sleeps. Unlimited when omitted. */
        maxTotalMs?: number;
        /** Per-attempt race. No per-attempt timeout when omitted. */
        perAttemptTimeoutMs?: number;
        backoff?: IRetryBackoffOptions;
        execution: (context: {
            attempt: number;
            signal?: AbortSignal;
        }) => ValueOrPromise<T>;
        /** Return `false` to stop retrying and rethrow `context.error` immediately. */
        shouldRetry?: (context: IRetryContext) => boolean;
        /** Observability hook, awaited before the backoff sleep. */
        onRetry?: (context: IRetryContext & {
            nextDelayMs: number;
        }) => ValueOrPromise<void>;
    }): Promise<T>;
    /** Retries `execution` while `until(result)` returns false - for read-after-write staleness behind a replicated pool. Never worse than a single un-retried call: on exhaustion the LAST result is returned rather than an error, and a thrown error propagates immediately instead of being retried. Only wrap idempotent operations. */
    static executeWithRetryUntil<T>(opts: {
        signal?: AbortSignal;
        logger?: ILogger;
        operation: string;
        /** @default 3 */
        maxAttempts?: number;
        /** Bounds when a NEW attempt may start; it never interrupts an attempt already in flight, so the first execution always runs to completion - a budget of 0 just means "no retries". */
        maxTotalMs?: number;
        backoff?: IRetryBackoffOptions;
        execution: (context: {
            attempt: number;
            signal?: AbortSignal;
        }) => ValueOrPromise<T>;
        /** Retry while this returns false. */
        until: (result: T) => boolean;
    }): Promise<T>;
}
```

Source: `packages/helpers/src/modules/retry/helper.ts`

## `RetryJitterModes`

*class*

How randomness is applied to a computed retry delay.

```ts
export declare class RetryJitterModes {
    /** The computed delay is used as-is. */
    static readonly NONE = "none";
    /** Uniform random in [0, delay) - decorrelates a thundering herd hardest. */
    static readonly FULL = "full";
    /** delay/2 + uniform random in [0, delay/2) - jittered but never less than half the delay. */
    static readonly EQUAL = "equal";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TRetryJitterMode;
}
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `SlugHelper`

*class*

Vietnamese-aware slugging. See `D_STROKE_REPLACEMENTS` for why `đ` maps to `d` and not `dj`.

```ts
export declare class SlugHelper extends BaseHelper {
    static slugify(opts: {
        value: string;
    }): string;
}
```

Source: `packages/helpers/src/modules/slug/helper.ts`

## `SnowflakeConfig`

*class*

Snowflake bit layout: 48-bit timestamp (~8,919 years), 10-bit worker ID (max 1024 workers), 12-bit sequence (4096/ms/worker).

```ts
export declare class SnowflakeConfig {
    static readonly DEFAULT_EPOCH: bigint;
    static readonly TIMESTAMP_BITS: bigint;
    static readonly WORKER_ID_BITS: bigint;
    static readonly SEQUENCE_BITS: bigint;
    static readonly MAX_WORKER_ID: bigint;
    static readonly MAX_SEQUENCE: bigint;
    static readonly WORKER_ID_SHIFT: bigint;
    static readonly TIMESTAMP_SHIFT: bigint;
    static readonly MAX_CLOCK_BACKWARD_MS: bigint;
    static readonly MAX_TIMESTAMP_MS: bigint;
    static readonly WARNING_THRESHOLD_MS: bigint;
}
```

Source: `packages/helpers/src/modules/uid/helper.ts`

## `SnowflakeUidHelper`

*class*

Snowflake ID generator with Base62 encoding for distributed, time-sortable unique IDs.

```ts
export declare class SnowflakeUidHelper extends BaseHelper {
    private readonly workerId;
    private readonly epoch;
    private sequence;
    private lastTimestamp;
    constructor(opts?: IIdGeneratorOptions);
    /** Generate next unique ID as Base62 string. */
    nextId(): string;
    /** Generate next unique ID as raw Snowflake bigint. */
    nextSnowflake(): bigint;
    /** Encode a bigint to Base62 string. */
    encodeBase62(num: bigint): string;
    /** Decode a Base62 string to bigint. */
    decodeBase62(str: string): bigint;
    /** Extract timestamp from a Snowflake ID. */
    extractTimestamp(id: bigint): Date;
    /** Extract worker ID from a Snowflake ID. */
    extractWorkerId(id: bigint): number;
    /** Extract sequence from a Snowflake ID. */
    extractSequence(id: bigint): number;
    /** Parse a Base62 ID and extract its components. */
    parseId(base62Id: string): ISnowflakeParsedId;
    /** Get current worker ID. */
    getWorkerId(): number;
    private currentTimestamp;
    private waitForNextMs;
    private validateWorkerId;
    private validateEpoch;
    private checkExpiryWarning;
}
```

Source: `packages/helpers/src/modules/uid/helper.ts`

## `TBuildInfoRecord`

*type*

The stamp with every field resolved: what the generator writes and what the health reporter answers.

```ts
export type TBuildInfoRecord = Required<IBuildInfo>;
```

Source: `packages/helpers/src/utilities/build-info.utility.ts`

## `TFetcherLogger`

*type*

What a fetcher calls on the logger it is handed, so a host logger with only these two (a browser app's) is accepted as is.

```ts
export type TFetcherLogger = Pick<ILogger, 'debug' | 'info'>;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`

## `TLogLevel`

*type*

One of the `LogLevels` values.

```ts
export type TLogLevel = TConstValue<typeof LogLevels>;
```

Source: `packages/helpers/src/modules/logger/common/types.ts`

## `TNodePredicate`

*type*

Decides whether `node` at `depth` (root is depth 0) matches some condition.

```ts
export type TNodePredicate<T> = (node: ITreeNode<T>, depth: number) => boolean;
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `TokenUidHelper`

*class*

Secret tokens: random bytes from the platform CSPRNG, written as base62 (the default), hex or
base64url, optionally prefixed. Use it for a secret - a verification link, an API key, a session id, a password reset.

- STORE A HASH, not the token. A database leak then leaks nothing a caller can replay.
- COMPARE IN CONSTANT TIME with `Hash.equals` (`crypto/algorithms/hash.algorithm.ts`), never `===`.
- Use `OpaqueUidHelper` for a short id a human reads, and `NumericUidHelper` for a code a human types.

`bytes` is the entropy, not the text length: the constructor refuses anything under
{@link MIN_TOKEN_BYTES} (128 bits). The finished string is `prefix + delimiter + body`. A base62
body is `ceil(bytes * 8 / log2(62))` characters (32 bytes is 43), a hex body `bytes * 2`, a
base64url body `ceil(bytes * 4 / 3)`.

`checksum: true` appends a CRC-32 of the body, so `isWellFormed` can reject a mistyped token before
any lookup. Enable it for a long-lived key a person copies, not for a one-shot link.

The prefix and delimiter follow `OpaqueUidHelper`'s rules, with no `caseForm`: a token's case is
its encoding's. A delimiter must sit outside the encoding's characters. `_` and `-` work with
base62 and hex; base64url holds both, so it takes only a delimiter such as `.`.

```ts
export declare class TokenUidHelper extends BaseHelper {
    private readonly bytes;
    private readonly encoding;
    private readonly prefix;
    private readonly delimiter;
    private readonly checksum;
    constructor(opts?: ITokenUidOptions);
    /** `prefix` replaces the configured value for this call and turns the prefix on for it; the delimiter follows its own switch. */
    nextId(opts?: INextTokenUidOptions): string;
    /**
     * A FORMAT filter, nothing more: does `opts.key` have the configured prefix and delimiter, the body
     * length and alphabet of the configured `bytes` and `encoding`, and (when enabled) a matching
     * checksum. Returns `false` on anything else, never throws, including for a value that is not a
     * string.
     *
     * It is NOT authentication. CRC-32 is public and forgeable, so anyone can build a token that passes.
     * A well-formed token still has to be looked up by its HASH and compared in constant time with
     * `Hash.equals`. Use this to refuse a mistyped or truncated token before spending a lookup on it.
     *
     * The head checked is the CONFIGURED prefix and delimiter (none when the instance has no prefix); a
     * token minted with a per-call prefix is checked by an instance configured with that prefix.
     */
    isWellFormed(opts: {
        key: string;
    }): boolean;
    private bodyLength;
    private checksumLength;
    /** The suffix for `body`: empty when the checksum is off, otherwise the CRC-32 of the body in the token's own alphabet, left-padded to a fixed width. */
    private checksumOf;
    private static alphabetOf;
    private randomBody;
    /** Hand-written, not `Buffer`: this module ships to a browser, where `Buffer` does not exist. */
    private static encode;
}
```

Source: `packages/helpers/src/modules/uid/token.ts`

## `TOnVisit`

*type*

Called once per visited node during a synchronous walk, with its BFS depth from the root.

```ts
export type TOnVisit<T> = (node: ITreeNode<T>, depth: number) => void;
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `TOnVisitAsync`

*type*

Async counterpart of {@link TOnVisit} - awaited before the walk enqueues the node's children.

```ts
export type TOnVisitAsync<T> = (node: ITreeNode<T>, depth: number) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/tree/common/types.ts`

## `TQueryStringNestedMode`

*type*

What {@link QueryStringNestedModes} selects: `drop` or `json`.

```ts
export type TQueryStringNestedMode = TConstValue<typeof QueryStringNestedModes>;
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `TQueryStringNullishMode`

*type*

What {@link QueryStringNullishModes} selects: `empty` or `skip`.

```ts
export type TQueryStringNullishMode = TConstValue<typeof QueryStringNullishModes>;
```

Source: `packages/helpers/src/modules/network/utilities/query-string.ts`

## `TreeBuilder`

*class*

Static members call each other through the class name (`TreeBuilder.xxx`), never `this` - a
detached static method loses its `this` binding.

```ts
export declare class TreeBuilder extends BaseHelper {
    /**
     * Always async, even if `getChildren` returns a plain array, since real fetchers hit a
     * repository. De-duplicates by `getKey` rather than tracking depth - see
     * {@link IBuildOptions.getKey} for why a repeated key skips silently instead of throwing.
     */
    static build<T>(opts: IBuildOptions<T>): Promise<ITreeNode<T>>;
    static leaves<T>(opts: {
        root: ITreeNode<T>;
        includePath: true;
    }): INodeWithPath<T>[];
    static leaves<T>(opts: {
        root: ITreeNode<T>;
        includePath?: false;
    }): ITreeNode<T>[];
    static nonLeaves<T>(opts: {
        root: ITreeNode<T>;
        includePath: true;
    }): INodeWithPath<T>[];
    static nonLeaves<T>(opts: {
        root: ITreeNode<T>;
        includePath?: false;
    }): ITreeNode<T>[];
    private static collect;
    /** Renders an ASCII tree, root on the first line, `├──`/`└──` branches below - useful for debug logs, not for parsing. */
    static print<T>(opts: IPrintOptions<T>): string;
}
```

Source: `packages/helpers/src/modules/tree/builder.ts`

## `TreeWalker`

*class*

Static members call each other through the class name (`TreeWalker.xxx`), never `this` - a
detached static method loses its `this` binding.

```ts
export declare class TreeWalker extends BaseHelper {
    /** `shouldPrune(node, depth)` returning true still calls `onVisit` for that node - only its children are skipped. */
    static walk<T>(opts: IWalkOptions<T>): void;
    /** Async counterpart of {@link TreeWalker.walk} - kept separate since `void` and `Promise<void>` can't share one signature. */
    static walkAsync<T>(opts: IWalkAsyncOptions<T>): Promise<void>;
    /** Longest root-to-leaf path, in edges. A lone root (no children) has height 0. */
    static height<T>(opts: {
        root: ITreeNode<T>;
    }): number;
    /** Like {@link TreeWalker.height}, but only nodes matching `predicate` count toward the maximum. Returns 0 when nothing matches. */
    static heightWhere<T>(opts: IHeightWhereOptions<T>): number;
    /** Total node count, root included. */
    static count<T>(opts: {
        root: ITreeNode<T>;
    }): number;
}
```

Source: `packages/helpers/src/modules/tree/walk.ts`

## `TRetryBackoffStrategy`

*type*

Union of the `RetryBackoffStrategies` values.

```ts
export type TRetryBackoffStrategy = TConstValue<typeof RetryBackoffStrategies>;
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `TRetryJitterMode`

*type*

Union of the `RetryJitterModes` values.

```ts
export type TRetryJitterMode = TConstValue<typeof RetryJitterModes>;
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `TUidCaseForm`

*type*

A value of {@link UidCaseForms}.

```ts
export type TUidCaseForm = TConstValue<typeof UidCaseForms>;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `TUidTokenEncoding`

*type*

A value of {@link UidTokenEncodings}.

```ts
export type TUidTokenEncoding = TConstValue<typeof UidTokenEncodings>;
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `TUrlScheme`

*type*

A scheme a guarded fetch accepts: `http:` or `https:`.

```ts
export type TUrlScheme = TConstValue<typeof UrlSchemes>;
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/constants.ts`

## `UidAlphabets`

*class*

Which characters an id may be built from. Every set here drops the pairs that collide in common
fonts - zero against capital O, one against capital I and lowercase L - so a human copying an id
off a screen cannot produce a different one.

```ts
export declare class UidAlphabets {
    /** Digits and both cases, nothing removed. Densest, and the only set here a human should not be asked to read. */
    static readonly BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    /** BASE62 minus `0`, `O`, `I`, `l`. 58 characters - the Bitcoin/Stripe-shaped alphabet. */
    static readonly BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    /** Crockford's base32: uppercase only, without `I`, `L`, `O` (ambiguous) and `U` (so no word can read as an obscenity). Case-insensitive by construction, which is what makes it safe in a CI column or a hostname. */
    static readonly CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    /** BASE58 without vowels, so no real word - and no accidental obscenity - can form. 50 characters. */
    static readonly NO_VOWEL = "123456789BCDFGHJKLMNPQRSTVWXYZbcdfghjkmnpqrstvwxyz";
}
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `UidCaseForms`

*class*

Whether an id mixes letter cases. Applied to the ALPHABET before sampling, never to the finished
string: folding the output would silently halve the entropy the caller thinks they asked for, and
would fold an excluded character back in - uppercasing a lowercase alphabet reintroduces `I` and
`O` that {@link UidAlphabets} took out.

```ts
export declare class UidCaseForms {
    static readonly UPPER = "upper";
    static readonly LOWER = "lower";
    static readonly MIXED = "mixed";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TUidCaseForm;
}
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `UidTokenEncodings`

*class*

How a token is written as text.

```ts
export declare class UidTokenEncodings {
    /**
     * `0-9 A-Z a-z`, each character equally likely ({@link UidAlphabets.BASE62}). 32 bytes of entropy is
     * 43 characters. The default: its alphabet holds no `_` or `-`, so a prefix delimiter and a URL both take it cleanly.
     */
    static readonly BASE62 = "base62";
    /** Lowercase `0-9 a-f`. 32 bytes is 64 characters. Safe anywhere text is, including a case-insensitive column. */
    static readonly HEX = "hex";
    /**
     * URL-safe base64 without padding: `A-Z a-z 0-9 - _`. 32 bytes is 43 characters. Kept for a token
     * whose format already is base64url (the mail verification token). It holds `-` and `_`, the
     * characters a delimiter is made of, so a prefix delimiter is refused unless it avoids both.
     */
    static readonly BASE64URL = "base64url";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TUidTokenEncoding;
}
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `UrlPolicy`

*class*

Everything about a url that can be decided without touching the network.

```ts
export declare class UrlPolicy {
    /** A dotted-quad that is not routable on the public internet. An unparseable input counts as non-public. */
    private static isNonPublicIPv4;
    /** The four octets of a dotted quad as two IPv6 groups, or `null` when it is not one. */
    private static dottedToGroups;
    /**
     * The eight 16-bit groups of an IPv6 literal, whatever its spelling: `::` compression, leading zeros,
     * upper case and a trailing dotted quad (`::127.0.0.1`) all expand to the same groups. `null` for a
     * string that is not an IPv6 literal.
     */
    private static expandIPv6;
    /** The IPv4 rules applied to the address carried in two IPv6 groups. */
    private static isNonPublicEmbedded;
    /**
     * An address that must never be reached with an untrusted url. Anything unrecognised answers
     * `true`: a guard that fails open on a string it cannot parse is not a guard. Takes an IP literal
     * only, in canonical text (dotted decimal without leading zeros; any IPv6 spelling): a domain name or a non-canonical IPv4
     * such as `0177.0.0.1` answers `true`.
     *
     * An IPv6 literal is expanded to its eight groups before it is classified, so every spelling of an
     * address gets the same answer. An address that carries an IPv4 one is judged by the IPv4 rules: v4-mapped
     * (`::ffff:0:0/96`), v4-compatible (`::a.b.c.d`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`); a
     * `64:ff9b::` address reaches 169.254.169.254 through a NAT64 gateway just as the dotted form does.
     * Unspecified, loopback, unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`),
     * site-local (`fec0::/10`), documentation (`2001:db8::/32`, `3fff::/20`), the IETF protocol assignments `2001::/23` (Teredo among them), discard (`100::/64`), SRv6 (`5f00::/16`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public.
     */
    static isNonPublicAddress(opts: {
        address: string;
    }): boolean;
    /** A bracketed IPv6 literal arrives as `[::1]`; the brackets are not part of the address. */
    static readHostAddress(opts: {
        hostname: string;
    }): string;
    /**
     * A hostname that RESOLVES to a private address passes here on purpose - `UrlIngest` catches that,
     * and this half runs where `node:dns` does not exist.
     */
    static assertSafeUrl(opts: {
        url: string;
        policy?: IUrlSafetyPolicy;
    }): URL;
    /**
     * True when the url will never be allowed, whatever happens next: a bad scheme, a non-public
     * address, a host outside the allow-list, a malformed url, or too many hops. Retrying any of those
     * repeats the same rejection - drop the work instead.
     *
     * A timeout, a DNS failure or a 5xx answers `false`: those are worth another attempt.
     */
    static isRefusedError(opts: {
        error: unknown;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/policy.ts`

## `UrlSafetyDefaults`

*class*

The values `IUrlSafetyPolicy` uses for a field the caller leaves unset; each is the safe choice.

```ts
export declare class UrlSafetyDefaults {
    static readonly ALLOWED_SCHEMES: string[];
    static readonly ALLOW_PRIVATE_ADDRESS = false;
    static readonly MAX_REDIRECTS = 3;
    static readonly TIMEOUT_MILLISECONDS = 10000;
    static readonly MAX_BYTES: number;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/constants.ts`

## `UrlSchemes`

*class*

The only schemes a guarded fetch will speak. `file:` and `gopher:` are the classic SSRF pivots.

```ts
export declare class UrlSchemes {
    static readonly HTTP = "http:";
    static readonly HTTPS = "https:";
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/constants.ts`

## `UUID_PATTERN`

*const*

Lowercase, version 1-8, RFC variant. The all-zero nil id and the all-one max id fail it on
purpose: both are placeholders, and a column holding one is holding a bug.

```ts
export declare const UUID_PATTERN: RegExp;
```

Source: `packages/helpers/src/modules/uid/uuid/common/constants.ts`

## `UuidHelper`

*class*

One door for every UUID IGNIS mints: `v7()` for a database key, `v5()` for a deterministic key,
`v4()` for a random public identifier. For a secret (a verification link, an API key, a session id)
use `TokenUidHelper` instead: a UUID v4 carries 122 random bits and a fixed, recognisable shape.

A facade over {@link UuidV4Generator}, {@link UuidV5Generator} and {@link UuidV7Generator} - importing one of those from
`@venizia/ignis-helpers/uuid` leaves the other two out of a browser bundle.

```ts
export declare class UuidHelper extends BaseHelper {
    /**
     * Per module copy, not realm-wide: the facade holds no state - ordering lives in the shared v7
     * sequence - and a realm-wide slot would hand an older version's instance, and its generators,
     * to every newer caller.
     */
    private static instance?;
    /** Random - a public identifier or a token. */
    readonly v4: () => string;
    /** Deterministic - same inputs, same id. Reproducible therefore not secret. */
    readonly v5: (opts: {
        namespace: string;
        name: string;
    }) => string;
    /** Time-ordered - a database key. A burst past about 2048 ids per millisecond leads the wall clock. */
    readonly v7: () => string;
    constructor(opts?: {
        scope?: string;
    });
    static getInstance(): UuidHelper;
    /** Lowercase, version 1-8, RFC variant - the nil and max placeholders are refused. */
    static isValid(value: string): boolean;
    /** Reads the version, and for v7 the creation time; undefined when it is not a UUID. */
    inspect(opts: {
        value: string;
    }): IUuidInspection | undefined;
}
```

Source: `packages/helpers/src/modules/uid/uuid/helper.ts`

## `UuidNamespaces`

*class*

The four namespaces RFC 9562 names. A namespace partitions the deterministic space, so one
`name` under two namespaces answers two ids.

Need your own? Mint it ONCE (`bun -e "console.log(crypto.randomUUID())"`) and pin it as a
constant. Generating one at runtime makes `uuidV5` answer a different id every call, silently.

```ts
export declare class UuidNamespaces {
    /** Fully-qualified domain names. */
    static readonly DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    /** URLs. The usual pick for a business key written as a path, like `orders/4711/refund`. */
    static readonly URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    /** ISO object identifiers. */
    static readonly OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";
    /** X.500 distinguished names. */
    static readonly X500 = "6ba7b814-9dad-11d1-80b4-00c04fd430c8";
}
```

Source: `packages/helpers/src/modules/uid/uuid/common/constants.ts`

## `UuidV4Generator`

*class*

Random UUID v4 generator. Use `generate()` for the shared instance or `create()` for one of your own.

```ts
export declare class UuidV4Generator {
    /**
     * Builds a v4 generator. `crypto.randomUUID` is captured once - whether a realm is a secure context
     * never changes - and called with no argument, since Node validates it and `['a'].map(...)` would
     * throw.
     */
    static create(): () => string;
    private static readonly shared;
    /** Mints a random UUID v4 - a public identifier or a token. Reads no `this`, so `['a'].map(UuidV4Generator.generate)` is safe. */
    static generate(): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v4.ts`

## `UuidV5Generator`

*class*

Deterministic UUID v5 generator: the same `namespace` and `name` always give the same id. Use `generate()` for the shared instance or `create()` for one with its own cache.

```ts
export declare class UuidV5Generator {
    /** Builds a v5 generator with its own namespace cache and buffer. */
    static create(): (opts: {
        namespace: string;
        name: string;
    }) => string;
    private static readonly shared;
    /**
     * Mints a deterministic UUID v5 from `namespace` and `name` - an idempotency key.
     *
     * Reproducible therefore NOT secret: never a share link, a reset token or an API key.
     */
    static generate(opts: {
        namespace: string;
        name: string;
    }): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v5.ts`

## `UuidV7Generator`

*class*

Time-ordered UUID v7 generator. Use `generate()` for the shared instance or `create()` for one with its own clock state and counter.

```ts
export declare class UuidV7Generator {
    /**
     * Builds a v7 generator with its own clock state and counter. Never `Bun.randomUUIDv7`: it is
     * slower, and it reads `(encoding, timestamp)` from whatever it is called with.
     */
    static create(): () => string;
    /** The realm's one generator: the one in the shared slot when another copy of this module put it there, else a new one that fills the slot. */
    private static resolveShared;
    private static readonly shared;
    /**
     * Mints a time-ordered UUID v7 - the default for a string primary key. Forwards no argument: the
     * shared slot may hold another helpers version's generator.
     */
    static generate(): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v7.ts`

## Re-exported

- `AbstractTemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `DayjsTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_LOCALE` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_PATTERN` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_TZ` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ErrorLogLevels` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ErrorScopes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `fromError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `getError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IDayjsFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IDayjsInstance` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IErrorKeyRegistry` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ILuxonDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ILuxonDateTimeFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IntlTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `isApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ITemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalDurationParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalLocaleNames` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalNamespace` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalZonedDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IZonedTemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `LuxonTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `MessageCode` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `MessageTemplate` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `NativeTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalDurationStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalInclusivities` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalNameWidths` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalUnits` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalWrittenDateStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByField` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinitionMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorKey` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorLogLevel` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageInput` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageOverride` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalized` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalizeTransformFn` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TRegisterErrors` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TRelativeUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TResponsedError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TTemporalDurationStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalFields` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInclusivity` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInput` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalMonthNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalWrittenDateStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
