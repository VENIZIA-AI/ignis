---
title: "@venizia/ignis-helpers (2 of 4)"
description: "Every export of @venizia/ignis-helpers, from the built declarations (generated)."
---

# `@venizia/ignis-helpers (2 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 4 of [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers).

## `DiskHelper`

*class*

Storage backed by the local filesystem: each bucket is a directory under `basePath`, each object a file whose key is its relative path. Names are validated and resolved paths must stay inside the bucket.

```ts
export declare class DiskHelper extends BaseStorageHelper {
    readonly storageType = "disk";
    private basePath;
    /** The `code` a file-system error carries, such as `ENOENT`. */
    private static errnoCode;
    constructor(options: IDiskHelperOptions);
    private getBucketPath;
    /**
     * Whether `target`, with every symbolic link followed, lies inside the real storage root. A target that does not exist
     * yet is judged by its nearest existing parent (a write creates the rest beneath it); a link whose own target is
     * missing is refused, because writing through it would create the file where the link points.
     */
    private isInsideRoot;
    /** The real path of `target`; a failure leaves as {@link DiskHelper.toRealPathError} answers it. */
    private realpathOrFail;
    /**
     * What a failed `realpath` is reported as: the code, never the path. Node's message holds the absolute path of the
     * server, and a refusal reaches the caller of the storage API. The full error stays in the log.
     */
    private toRealPathError;
    /** `null` when nothing is there (or it cannot be read): the caller walks up to the parent and judges that. */
    private lstatOrNull;
    /** A directory that exists AND lies inside the real root: a bucket that is a link leading outside is not one. */
    private isReachableBucketPath;
    /** The path of an object after the checks of {@link DiskHelper.resolveObjectPath} and the real-path containment check. */
    private resolveContainedObjectPath;
    /** Validates the name AND the resolved path: containment survives a naming rule we get wrong. */
    private resolveObjectPath;
    /** `null` means not there. Anything but ENOENT is logged: it may exist and be unreadable. */
    private statOrNull;
    private exists;
    /** An object is a regular file: a directory under the same path is not one, so it reads as not found. */
    private isFile;
    /** One `stat` answers existence and type. */
    hasBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    getBuckets(): Promise<IBucketInfo[]>;
    getBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    createBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    removeBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    protected get defaultLinkPrefix(): string;
    protected writeObject(opts: IObjectLocation & {
        file: IUploadFile;
    }): Promise<void>;
    getObject(opts: IObjectLocation & {
        options?: unknown;
    }): Promise<Readable>;
    /** `createReadStream` seeks natively, so a range never reads the bytes before it. */
    getObjectStream(opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>>;
    getStat(opts: IObjectLocation): Promise<IFileStat>;
    removeObject(opts: IObjectLocation): Promise<void>;
    removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
```

Source: `packages/helpers/src/modules/storage/disk/helper.ts`

## `Environment`

*class*

Adds the `NODE_ENV` reads to {@link EnvironmentNames}. Every name and set is inherited, so `Environment.PRODUCTION`, `Environment.COMMON_ENVS` and `Environment.DEVELOPMENT_ENVS` keep resolving here; only these two members need a `process`.

```ts
export declare class Environment extends EnvironmentNames {
    /** `NODE_ENV` exactly as the host has it, `undefined` when unset. Destructured on purpose: `bun build` rewrites `process.env.NODE_ENV` to a literal at build time, a destructured read stays a runtime read. */
    static get ambient(): string | undefined;
    static get current(): string;
    static is(opts: {
        name: string;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `ErrorPrettier`

*class*

Turns a thrown value into something a human can read in a console - log this, never the raw error.

```ts
export declare class ErrorPrettier {
    /** Bounds a pathological or cyclic `cause` chain. */
    static readonly DEFAULT_MAX_CAUSE_DEPTH = 5;
    /** The throw site is near the top; the tail is identical framework plumbing for every request. */
    static readonly DEFAULT_MAX_STACK_FRAMES = 10;
    /** Driver diagnostics that are actionable and absent from `message` - `pg` supplies all four. */
    private static readonly DIAGNOSTIC_KEYS;
    /** A stack frame line in every V8 stack: `    at fn (file:line:col)`. */
    private static readonly FRAME_PATTERN;
    /** A frame inside an installed package - `node_modules/` covers bun's `.bun/` store too. */
    private static readonly DEPENDENCY_FRAME_PATTERN;
    /** `getError` sits on top of every `ApplicationError` stack and names no call site. Installed, it is also the FIRST dependency frame, so the keep-the-first rule would preserve exactly the wrong one. Anchored on `inversion` so an application's own `modules/error/app-error` is not swallowed with it. */
    private static readonly ERROR_FACTORY_FRAME_PATTERN;
    /** Issues rendered from a ZodError before the rest are counted off. */
    private static readonly MAX_ZOD_ISSUES;
    /** Members of an `AggregateError` rendered before the rest are counted off. */
    private static readonly MAX_AGGREGATED_ERRORS;
    private static readonly INSPECT_OPTIONS;
    private static extractFrames;
    /** A ZodError's `message` is its issue array as pretty JSON - dozens of lines for one bad field. Render `path: reason` instead. */
    private static compressZodMessage;
    private static summarizeNode;
    private static pushDiagnostics;
    /** Under whichever node collected them - a wrapped `AggregateError` is the common shape. */
    private static pushAggregatedErrors;
    /** Reduces any thrown value to {@link IErrorSummary} - always a summary, never a bare primitive. */
    static summarize(opts: {
        error: unknown;
        includeStack?: boolean;
        maxCauseDepth?: number;
        maxStackFrames?: number;
    }): IErrorSummary;
    /** Resolved per call, not at module load, so a test passes a value instead of mutating the environment. */
    private static resolveFormat;
    /** `JSON.stringify` throws on a cycle, and `format` runs inside the error handler - a throw there turns a handled failure into an unhandled one. `redactSecrets` breaks cycles on its own, but it is switched off by `APP_ENV_LOGGER_DO_REDACT=false`, so structural safety cannot lean on it. A repeated reference reads as `[Circular]` too: the first occurrence still carries the data. */
    private static safeStringify;
    /** One line, so a log monitor keeps the error as ONE record instead of one per bullet. */
    private static renderJson;
    private static renderText;
    /** Renders {@link summarize}. `text` returns a block whose newlines survive `%s`; `json` returns one line. */
    static format(opts: {
        error: unknown;
        messageCode?: string;
        extra?: unknown;
        includeStack?: boolean;
        maxStackFrames?: number;
        format?: TLoggerFormat;
        inspectOptions?: util.InspectOptions;
    }): string;
}
```

Source: `packages/helpers/src/modules/logger/formatting/error-prettier.ts`

## `ErrorUtility`

*class*

Helpers for values caught in `catch` blocks.

```ts
export declare class ErrorUtility {
    /** Normalize an unknown thrown value into an Error instance - an ApplicationError when it was not one. */
    static toError(opts: {
        error: unknown;
    }): Error;
}
```

Source: `packages/helpers/src/utilities/error.utility.ts`

## `FC`

*type*

Kept out of the `./common` barrel because `hono/jsx` types reach DOM-dependent JSX intrinsics; `hono` is an optional peer, so a Worker or hono-less consumer of `./common` must not have this file in its type graph. Re-exported directly from the root barrel (`src/index.ts`) instead, so `Child`/`FC`/`PropsWithChildren` stay publicly reachable from `@venizia/ignis-helpers`.

```ts
type FC<P = Props> = { (props: P): FunctionComponentResult; defaultProps?: Partial<P> | undefined; displayName?: string | undefined; }
```

## `Hash`

*class*

One-way message digests and keyed HMACs. Unlike `AES`/`RSA` this has no `decrypt` - a digest
cannot be reversed, so `digest`/`hmac` are the only operations, not `ICryptoAlgorithm`.

```ts
export declare class Hash extends BaseHelper {
    algorithm: THashAlgorithm;
    constructor(opts: {
        algorithm: THashAlgorithm;
    });
    /** Memoized - `BaseHelper`'s constructor resolves a logger on every allocation (~50ns), and downstream token code calls `withAlgorithm` per request. */
    private static readonly instances;
    static withAlgorithm(algorithm: THashAlgorithm): Hash;
    validateAlgorithmName(opts: {
        algorithm: THashAlgorithm;
    }): void;
    /**
     * Plain digest, no secret. `message` is text (UTF-8), bytes, or several parts hashed in order as ONE message: a git
     * blob is the header text "blob <size>" and a NUL byte, then the bytes, so its parts are the header and the bytes. MD5/SHA1
     * are broken/weak - see {@link HashAlgorithms} - never use for security decisions.
     */
    digest(opts: {
        message: THashInput | ReadonlyArray<THashInput>;
        opts?: IHashExtraOptions;
    }): string;
    /**
     * Keyed HMAC. `message` and `secret` are text (UTF-8) or bytes: a `Buffer` or `Uint8Array` key gives the same output
     * as the text of the same bytes, so a token printed with one keeps verifying with the other. `secret` is mandatory and
     * validated non-empty so a request for an HMAC never silently degrades into an unkeyed digest.
     */
    hmac(opts: {
        message: THashInput;
        secret: THashInput;
        opts?: IHashExtraOptions;
    }): string;
    /**
     * Compares two strings exactly as given, in constant time: the byte length first, then `crypto.timingSafeEqual`. For
     * two digests that are both already in hand, such as an idempotency fingerprint against a saved one, where
     * {@link Hash.verify} has nothing to hash. `false` for any difference, never a throw, and `false` too for a value that
     * is not a string. Two empty strings are equal. The text is compared, not the bytes it stands for: hex in upper case
     * does not equal hex in lower case.
     */
    static equals(opts: {
        value: string;
        expected: string;
    }): boolean;
    /**
     * Checks a received digest against the one `value` produces, in constant time. Use it for a webhook signature or a
     * payment callback instead of `===`, which stops at the first differing character and so tells an attacker how many
     * leading characters of a forged value were right.
     *
     * `value` is hashed the way {@link Hash.digest} does, or keyed with `secret` the way {@link Hash.hmac} does, then
     * written in `outputEncoding` (hex by default) and compared with `expected` by {@link Hash.equals}. A different length
     * answers `false` without comparing, and the answer is `false`, never a throw, for any mismatch. `expected` is exact
     * text: hex in upper case does not equal hex in lower case, and an unpadded or URL-safe form of the same base64 digest
     * is refused. Pass the matching `outputEncoding` (`base64url`), or normalise the text first.
     */
    verify(opts: {
        value: THashInput;
        expected: string;
        secret?: THashInput;
        opts?: IHashExtraOptions;
    }): boolean;
}

/** Text is hashed as UTF-8, bytes as they are. */
type THashInput = string | Uint8Array;

interface IHashExtraOptions {
    outputEncoding?: THashOutputEncoding;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`

## `HashAlgorithms`

*class*

Digest names the hash algorithm accepts. `isValid` narrows a string to `THashAlgorithm`.

```ts
export declare class HashAlgorithms extends ConstClass {
    /** Cryptographically broken - kept only for wire-protocol compatibility (VNPay checksums); never use for security decisions. */
    static readonly MD5 = "md5";
    /** Cryptographically weak - kept for wire-protocol compatibility with legacy integrations; never use for security decisions. */
    static readonly SHA1 = "sha1";
    static readonly SHA256 = "sha256";
    static readonly SHA384 = "sha384";
    static readonly SHA512 = "sha512";
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `HashOutputEncodings`

*class*

Text encodings a digest can be written in. `isValid` narrows a string to `THashOutputEncoding`.

```ts
export declare class HashOutputEncodings extends ConstClass {
    static readonly HEX = "hex";
    static readonly BASE64 = "base64";
    static readonly BASE64URL = "base64url";
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `HF_MESSAGE_MAX_BYTES`

*const*

Max message size in UTF-8 BYTES (not characters); longer messages truncate silently.

```ts
export declare const HF_MESSAGE_MAX_BYTES = 213;
```

Source: `packages/helpers/src/modules/logger/hf/common/constants.ts`

## `HF_SCOPE_MAX_BYTES`

*const*

Max scope size in UTF-8 BYTES (not characters - a multibyte scope truncates by byte).

```ts
export declare const HF_SCOPE_MAX_BYTES = 32;
```

Source: `packages/helpers/src/modules/logger/hf/common/constants.ts`

## `HfLogFlusher`

*class*

Drains the ring in bounded batches, yielding between them - see the spec's lap accounting.

```ts
export declare class HfLogFlusher {
    private static readonly textDecoder;
    private flushIndex;
    private inFlightDrain;
    private timer;
    private readonly sink;
    private readonly batchSize;
    constructor(options?: IHfLogFlusherOptions);
    private static renderEntry;
    private static buildDefaultSink;
    flush(): Promise<void>;
    private drain;
    private deliverBatch;
    start(intervalMs?: number): void;
    stop(): void;
}
```

Source: `packages/helpers/src/modules/logger/hf/flusher.ts`

## `HfLogger`

*class*

Ring-buffer logger for hot paths; extends AbstractLogger, NOT BaseLogger - BaseLogger's string-sink plumbing is exactly the cost this implementation exists to avoid.

```ts
export declare class HfLogger extends AbstractLogger {
    private static readonly textEncoder;
    private static readonly scopeCache;
    private static cache;
    private static messageCache;
    private readonly scope;
    private readonly scopeBytes;
    private readonly scopeLength;
    private readonly ring;
    private constructor();
    private static encodeScope;
    static get(scope: string): HfLogger;
    /** Pre-encode a message at initialization time; the cache is FIFO-bounded so dynamic strings can't grow it without limit. */
    static encodeMessage(message: string): Uint8Array;
    private static evictOldestMessage;
    private writeEntry;
    private writeString;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    emerg(message: string, ...args: unknown[]): void;
    log(level: TLogLevel, message: string, ...args: unknown[]): void;
    log(level: TLogLevel, messageBytes: Uint8Array): void;
    for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/hf/logger.ts`

## `HookUtility`

*class*

Runs user-supplied hooks so a throw or rejection is logged and never breaks the caller.

```ts
export declare class HookUtility {
    /** Fire-and-forget a hook from inside an event listener. Takes a thunk because `PromiseUtility.voidExecution` takes a VALUE - a synchronous throw would escape the guard and, inside an emitter callback, take the process down. Rejections still route to the logger. */
    static invoke(opts: {
        logger: ILogger;
        scope: string;
        execution: () => ValueOrPromise<unknown>;
    }): void;
    /** Await a user-supplied hook, absorbing sync throws and rejections without breaking the caller's state machine. */
    static execute(opts: {
        logger: ILogger;
        scope: string;
        execution: () => ValueOrPromise<unknown>;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/common/hook.ts`

## `HrTimeUtility`

*class*

Elapsed-time measurement from the Node high-resolution clock.

```ts
export declare class HrTimeUtility {
    /**
     * Seconds from the process's high-resolution clock, to nine decimals - for measuring, not for dates.
     * A file of its own: `process.hrtime` is Node-only, and `performance.utility` ships on `/core`.
     */
    static getSeconds(): number;
}
```

Source: `packages/helpers/src/utilities/hr-time.utility.ts`

## `IAESKeyringEntry`

*interface*

One key in a keyring: `id` is written into the ciphertext so decrypt can pick the matching `secret`.

```ts
export interface IAESKeyringEntry {
    id: string;
    secret: string;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`

## `IApplicationEnvironment`

*interface*

Read and write contract of the application environment store. Every value is a string: `get` answers the raw string (or `undefined`), the `defaultValue` of a string read, or what a `transform` makes of the raw string.

```ts
export interface IApplicationEnvironment {
    get(key: string): string | undefined;
    get(key: string, opts: {
        defaultValue: string;
    }): string;
    /** A transform that may answer nothing, with the `defaultValue` that then applies: the `defaultValue` fixes `R`. */
    get<R>(key: string, opts: IApplicationEnvironmentDefaultedTransformOptions<R>): R;
    /** What the transform makes of the raw string: `R` is inferred from the transform. */
    get<R>(key: string, opts: IApplicationEnvironmentTransformOptions<R>): R;
    getRequired(key: string): string;
    getRequired<R>(key: string, opts: {
        transform: (raw: string) => TNullable<R>;
    }): R;
    set(key: string, value: string | undefined): void;
}
```

Source: `packages/helpers/src/modules/env/common/types.ts`

## `IApplicationEnvironmentDefaultedTransformOptions`

*interface*

A `transform` that may answer null or undefined, with the `defaultValue` that then applies: the read answers `R`.

```ts
export interface IApplicationEnvironmentDefaultedTransformOptions<R> {
    transform: (raw: string | undefined) => TNullable<R>;
    defaultValue: R;
}
```

Source: `packages/helpers/src/modules/env/common/types.ts`

## `IApplicationEnvironmentTransformOptions`

*interface*

Options of `get` that run a `transform` over the raw value; `defaultValue` applies when the value is absent or the transform answers null or undefined.

```ts
export interface IApplicationEnvironmentTransformOptions<R> {
    transform: (raw: string | undefined) => R;
    defaultValue?: R;
}
```

Source: `packages/helpers/src/modules/env/common/types.ts`

## `IBucketInfo`

*interface*

A bucket as `getBuckets`, `getBucket` and `createBucket` report it.

```ts
export interface IBucketInfo {
    name: string;
    creationDate: Date;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IBucketRef`

*interface*

One bucket.

```ts
export interface IBucketRef {
    name: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IBunServer`

*interface*

The subset of a Bun server the WebSocket helper uses to publish to topics.

```ts
export interface IBunServer {
    readonly pendingWebSockets: number;
    publish(topic: string, data: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView, compress?: boolean): number;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IBunWebSocketConfig`

*interface*

Bun WebSocket native configuration options

```ts
export interface IBunWebSocketConfig {
    perMessageDeflate?: boolean;
    maxPayloadLength?: number;
    idleTimeout?: number;
    backpressureLimit?: number;
    closeOnBackpressureLimit?: boolean;
    sendPings?: boolean;
    publishToSelf?: boolean;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IBunWebSocketHandler`

*interface*

Return type for getBunWebSocketHandler - handlers + config spread for server.reload()

```ts
export interface IBunWebSocketHandler extends IBunWebSocketConfig {
    open: (socket: IWebSocket<IWebSocketData>) => void;
    message: (socket: IWebSocket<IWebSocketData>, message: string | Buffer) => void;
    close: (socket: IWebSocket<IWebSocketData>, code: number, reason: string) => void;
    drain: (socket: IWebSocket<IWebSocketData>) => void;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IByteRange`

*interface*

A byte window of an object. `end` is inclusive, like the HTTP `Range` header.

```ts
export interface IByteRange {
    start: number;
    end?: number;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IClock`

*interface*

Injectable clock so tests advance time deterministically.

```ts
export interface IClock {
    now(): number;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/timer.ts`

## `ICopyObjectOptions`

*interface*

`copyObject`: a copy within one bucket.

```ts
export interface ICopyObjectOptions {
    bucket: IBucketRef;
    source: IObjectRef;
    destination: IObjectRef;
    /** Copy only if the source still has this ETag; otherwise `StorageErrors.PRECONDITION_FAILED`. */
    ifMatch?: string;
    /** Copy this exact version of the source. */
    sourceVersionId?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `ICryptoAlgorithm`

*interface*

Contract of an encryption algorithm: `encrypt` and `decrypt` take one options object holding `message`, `secret` and optional algorithm-specific `opts`. The type parameters set the input, secret and return types of each side.

```ts
export interface ICryptoAlgorithm<AlgorithmNameType extends string, EncryptInputType = unknown, DecryptInputType = unknown, SecretKeyType = unknown, EncryptReturnType = unknown, DecryptReturnType = unknown, ExtraOptions = unknown> {
    algorithm: AlgorithmNameType;
    encrypt(opts: {
        message: EncryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): EncryptReturnType;
    decrypt(opts: {
        message: DecryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): DecryptReturnType;
}
```

Source: `packages/helpers/src/modules/crypto/common/types.ts`

## `IDiskHelperOptions`

*interface*

Options for `DiskHelper`; `basePath` is created when missing.

```ts
export interface IDiskHelperOptions extends IStorageHelperOptions {
    /** Base directory every bucket lives under. */
    basePath: string;
}
```

Source: `packages/helpers/src/modules/storage/disk/helper.ts`

## `IDotenvSecretsRegistration`

*interface*

Registers a dotenv vault file; `config` is optional.

```ts
export interface IDotenvSecretsRegistration extends ISecretsRegistrationBase {
    provider: typeof SecretProviders.DOTENV_VAULT;
    config?: TRegistrationConfig<IDotenvVaultHelperOptions>;
}

/** What every registration carries, whatever its provider. */
interface ISecretsRegistrationBase {
    hydrate?: Array<ISecretHydrateEntry>;
    lease?: Array<ISecretLeaseEntry>;
    /**
     * Renew a lease at ttl * ratio.
     *
     * @default 0.66
     */
    renewBeforeRatio?: number;
    /**
     * TTL (seconds) for the static get/getBundle cache.
     *
     * @default 300
     */
    cacheTtlSeconds?: number;
}

/** The helper options a registration's `config` fills; the registration owns the identifier, the cache TTL and the renewal ratio. */
type TRegistrationConfig<Options> = Omit<Options, 'identifier' | 'cacheTtlSeconds' | 'renewBeforeRatio'>;
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `IErrorSummary`

*interface*

Useful-only projection of an error: a driver's `query`/`params` repeat the message and are dropped.

```ts
export interface IErrorSummary {
    name?: string;
    message?: string;
    /** The error's OWN code - a driver's `23505`, a gRPC `14`. Belongs with the name, not with the message. */
    code?: string | number;
    /** An `ApplicationError`'s `normalized.code` - the identifier an application filters on. `MessageCode.DEFAULT` never surfaces. */
    messageCode?: string;
    /** Frames ONLY - V8's `Error: <message>` header is stripped so the message is not repeated. */
    stack?: string;
    hint?: string;
    detail?: string;
    table?: string;
    constraint?: string;
    /** Values for the `%{placeholder}` tokens left unresolved in `message` - i18n resolves them downstream, so the log must carry them or the message names no field. */
    args?: Record<string, unknown>;
    /** An `ApplicationError`'s caller context - the one unmodelled payload worth keeping. */
    extra?: Record<string, unknown>;
    cause?: IErrorSummary;
    /** Every reason an `AggregateError` collected. Its own message names none of them, so without this the log says only that something failed. */
    errors?: Array<IErrorSummary>;
}
```

Source: `packages/helpers/src/modules/logger/formatting/error-prettier.ts`

## `IFileStat`

*interface*

What `getStat` reports for one object. `size` is in bytes.

```ts
export interface IFileStat {
    size: number;
    metadata: IObjectMetadata;
    lastModified?: Date;
    etag?: string;
    versionId?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IGetSecretOptions`

*interface*

Selects a secret: the `path` of a bundle and optionally one `key` in it. `defaultValue` is returned when the key is absent.

```ts
export interface IGetSecretOptions<TValue = string> {
    path: string;
    key?: string;
    defaultValue?: TValue;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/helper.ts`

## `IHashiCorpSecretsRegistration`

*interface*

Registers HashiCorp Vault; `config` carries the endpoint and the auth.

```ts
export interface IHashiCorpSecretsRegistration extends ISecretsRegistrationBase {
    provider: typeof SecretProviders.HASHICORP_VAULT;
    config: TRegistrationConfig<IHashiCorpVaultHelperOptions>;
}

/** What every registration carries, whatever its provider. */
interface ISecretsRegistrationBase {
    hydrate?: Array<ISecretHydrateEntry>;
    lease?: Array<ISecretLeaseEntry>;
    /**
     * Renew a lease at ttl * ratio.
     *
     * @default 0.66
     */
    renewBeforeRatio?: number;
    /**
     * TTL (seconds) for the static get/getBundle cache.
     *
     * @default 300
     */
    cacheTtlSeconds?: number;
}

/** The helper options a registration's `config` fills; the registration owns the identifier, the cache TTL and the renewal ratio. */
type TRegistrationConfig<Options> = Omit<Options, 'identifier' | 'cacheTtlSeconds' | 'renewBeforeRatio'>;
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `IHfLogFlusherOptions`

*interface*

Where the high-frequency logger flusher delivers batches: a custom `sink`, a `filePath`, or stdout when neither is set.

```ts
export interface IHfLogFlusherOptions {
    /** Full custom delivery. Overrides filePath. */
    sink?: THfSink;
    /** File the default sink appends to instead of writing to stdout. */
    filePath?: string;
    /**
     * Entries rendered per batch before yielding.
     * @default HF_DEFAULT_BATCH_SIZE
     */
    batchSize?: number;
}
```

Source: `packages/helpers/src/modules/logger/hf/common/types.ts`

## `IListObjectsOptions`

*interface*

Filters for `listObjects`. `maxKeys` caps the result, and `0` returns nothing.

```ts
export interface IListObjectsOptions {
    bucket: IBucketRef;
    prefix?: string;
    /**
     * Whether the listing descends into folders.
     *
     * @default false
     */
    useRecursive?: boolean;
    maxKeys?: number;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `INetworkTcpClientProps`

*interface*

Options of a TCP client. `createClientFn` opens the socket, so one client type serves plain and TLS.

```ts
export interface INetworkTcpClientProps<SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions, SocketClientType extends PlainSocketClient | TlsSocketClient> {
    identifier: string;
    scope?: string;
    options: SocketClientOptions;
    /**
     * Retries after a close, up to `maxRetry` times.
     * @default false
     */
    reconnect?: boolean;
    /**
     * How many reconnects `reconnect` attempts.
     * @default 5
     */
    maxRetry?: number;
    /** When set, `onData` receives strings in this encoding instead of buffers. */
    encoding?: BufferEncoding;
    createClientFn: (options: SocketClientOptions, connectionListener?: () => void) => SocketClientType;
    onConnected?: (opts: {
        client: SocketClientType;
    }) => ValueOrPromise<void>;
    onData?: (opts: {
        identifier: string;
        message: string | Buffer;
    }) => ValueOrPromise<void>;
    onClosed?: (opts: {
        client: SocketClientType;
    }) => void;
    onError?: (error: unknown) => void;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`

## `IObjectInfo`

*interface*

One entry of `listObjects`. `name` is the full object key.

```ts
export interface IObjectInfo {
    name?: string;
    size?: number;
    lastModified?: Date;
    etag?: string;
    prefix?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectLocation`

*interface*

Which bucket, which object.

```ts
export interface IObjectLocation {
    bucket: IBucketRef;
    object: IObjectRef;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectMetadata`

*interface*

`mimetype` is named because consumers persist it; `any` let it be renamed silently.

```ts
export interface IObjectMetadata {
    mimetype?: string;
    [key: string]: unknown;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectRef`

*interface*

One object. `key` is the S3 term.

```ts
export interface IObjectRef {
    key: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IParsedMultipartBody`

*interface*

Files and the text fields posted beside them - dropping the second silently loses what the client sent.

```ts
export interface IParsedMultipartBody {
    files: IParsedFile[];
    fields: Record<string, string>;
}

interface IParsedFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer?: Buffer;
    filename?: string;
    path?: string;
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `IPostPolicy`

*interface*

What `presignPost` hands a browser: where to post, the fields to post with it, and when the grant dies.

```ts
export interface IPostPolicy {
    postURL: string;
    formData: Record<string, string>;
    expiresAt: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IPresignGetOptions`

*interface*

`presignGet`.

```ts
export interface IPresignGetOptions extends IObjectLocation {
    expiresIn?: IDuration;
    responseContentType?: string;
    responseContentDisposition?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IPresignPostOptions`

*interface*

`presignPost`: the one object a browser form may be posted under, and its size ceiling.

```ts
export interface IPresignPostOptions extends IObjectLocation {
    maxBytes: number;
    contentType?: string;
    expiresIn?: IDuration;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IPresignPutOptions`

*interface*

`presignPut`. Every option is SIGNED - the client must send it back unchanged.

```ts
export interface IPresignPutOptions extends IObjectLocation {
    expiresIn?: IDuration;
    /** The object's tag set, written at the moment it is stored. */
    tagging?: Record<string, string>;
    /** Pins the body to EXACTLY this many bytes. A retry at a different size is refused. */
    contentLength?: number;
    /** Pins the stored content type. Unsigned, the uploader picks what is stored - and the stored type is what a browser later renders. */
    contentType?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IQueueCallback`

*interface*

Hooks of a sequential queue.

```ts
export interface IQueueCallback<TElementPayload> {
    /**
     * Whether {@link SequentialQueueHelper} dispatches an element on its own.
     * @default true
     */
    autoDispatch?: boolean;
    onMessage?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onDataEnqueue?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onDataDequeue?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onStateChange?: (opts: {
        identifier: string;
        from: TQueueStatus;
        to: TQueueStatus;
    }) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `IRedisClusterHelperOptions`

*interface*

Options for `RedisClusterHelper`: connection props, lifecycle callbacks and an optional `ioredis` module.

```ts
export interface IRedisClusterHelperOptions extends IRedisClusterHelperProps, IRedisHelperCallbacks, IRedisModuleOption {
}
```

Source: `packages/helpers/src/modules/redis/cluster/types.ts`

## `IRedisClusterHelperProps`

*interface*

Connection settings for a Redis Cluster: the startup `nodes` and one credential pair for every node, plus raw ioredis `clusterOptions` that override the helper defaults. The credentials go through `redisOptions`, so nodes found after startup get them too.

```ts
export interface IRedisClusterHelperProps extends IRedisCredentials {
    name: string;
    nodes: IRedisNode[];
    /**
     * Same meaning as on single and sentinel: `false` holds the client open for a later `connect()`.
     *
     * @default true
     */
    autoConnect?: boolean;
    /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. `clusterOptions` still overrides. @default RedisDefaults.MAX_RETRY (5) */
    maxRetry?: number;
    clusterOptions?: ClusterOptions;
}
```

Source: `packages/helpers/src/modules/redis/cluster/types.ts`

## `IRedisCommand`

*interface*

Escape hatch to run any Redis command by name.

```ts
export interface IRedisCommand {
    execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisConnection`

*interface*

Client access and connection lifecycle of a Redis helper. `connect` and `disconnect` resolve `false` when the client status makes the call a no-op.

```ts
export interface IRedisConnection {
    getClient(): TRedisClient;
    duplicateClient(): TRedisClient;
    ping(): Promise<string>;
    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisCredentials`

*interface*

An ACL user and its password. Omit both to authenticate as the `default` user with no password.

```ts
export interface IRedisCredentials {
    /** The Redis ACL user, with `password`. Omit it to authenticate as the `default` user. */
    username?: string;
    /** Omit it for a Redis with no password. */
    password?: string;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisHash`

*interface*

Hash commands (`HSET`, `HGET`, ...) on one key.

```ts
export interface IRedisHash {
    hSet<T extends Record<string, unknown>>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
        };
    }): Promise<number>;
    hGetAll(opts: {
        key: string;
        transform?: <T, R>(input: T) => R;
    }): Promise<unknown>;
    hGet(opts: {
        key: string;
        field: string;
    }): Promise<string | null>;
    hDel(opts: {
        key: string;
        fields: Array<string>;
    }): Promise<number>;
    hExists(opts: {
        key: string;
        field: string;
    }): Promise<boolean>;
    hKeys(opts: {
        key: string;
    }): Promise<string[]>;
    hVals(opts: {
        key: string;
    }): Promise<string[]>;
    hIncrBy(opts: {
        key: string;
        field: string;
        value: number;
    }): Promise<number>;
    hLen(opts: {
        key: string;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisHelperCallbacks`

*interface*

Lifecycle hooks a Redis helper calls; each receives the helper name and the helper itself.

```ts
export interface IRedisHelperCallbacks {
    onInitialized?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onConnected?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onReady?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onError?: (opts: {
        name: string;
        helper: IRedisHelper;
        error: unknown;
    }) => void;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisJson`

*interface*

RedisJSON commands (`JSON.SET`, `JSON.GET`, ...); the Redis server needs the JSON module.

```ts
export interface IRedisJson {
    jSet<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<string | null>;
    jGet<T>(opts: {
        key: string;
        /** @default '$' */
        path?: string;
    }): Promise<T | null>;
    jDelete(opts: {
        key: string;
        /** @default '$' */
        path?: string;
    }): Promise<number>;
    jNumberIncreaseBy(opts: {
        key: string;
        path: string;
        value: number;
    }): Promise<string | null>;
    jStringAppend(opts: {
        key: string;
        path: string;
        value: string;
    }): Promise<number[] | null>;
    jPush<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<number[] | null>;
    jPop<T>(opts: {
        key: string;
        path: string;
    }): Promise<T | null>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisKey`

*interface*

Key-level commands: existence, expiry, TTL and counters.

```ts
export interface IRedisKey {
    exists(opts: {
        keys: Array<string>;
    }): Promise<number>;
    expire(opts: {
        key: string;
        seconds: number;
    }): Promise<boolean>;
    expireAt(opts: {
        key: string;
        atEpochSeconds: number;
    }): Promise<boolean>;
    ttl(opts: {
        key: string;
    }): Promise<number>;
    persist(opts: {
        key: string;
    }): Promise<boolean>;
    incr(opts: {
        key: string;
    }): Promise<number>;
    decr(opts: {
        key: string;
    }): Promise<number>;
    incrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
    decrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisKeyValue`

*interface*

String value commands, including JSON-serialised object reads and batch get and set. `set` `expiresIn` is in milliseconds.

```ts
export interface IRedisKeyValue {
    set<T>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
            expiresIn?: number;
        };
    }): Promise<void>;
    get<T = string>(opts: {
        key: string;
        transform?: (input: string) => T;
    }): Promise<T | null>;
    del(opts: {
        keys: Array<string>;
    }): Promise<number>;
    keys(opts: {
        key: string;
    }): Promise<Array<string>>;
    getString(opts: {
        key: string;
    }): Promise<string | null>;
    getStrings(opts: {
        keys: Array<string>;
    }): Promise<(string | null)[]>;
    getObject<T>(opts: {
        key: string;
    }): Promise<T | null>;
    getObjects(opts: {
        keys: Array<string>;
    }): Promise<(unknown | null)[]>;
    mSet<T>(opts: {
        payload: Array<{
            key: string;
            value: T;
        }>;
        options?: {
            log?: boolean;
        };
    }): Promise<void>;
    mGet<T = string>(opts: {
        keys: Array<string>;
        transform?: (input: string) => T;
    }): Promise<(T | null)[]>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisList`

*interface*

List commands (`LPUSH`, `LRANGE`, ...) on one key.

```ts
export interface IRedisList {
    lPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    rPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    lPop(opts: {
        key: string;
    }): Promise<string | null>;
    rPop(opts: {
        key: string;
    }): Promise<string | null>;
    lRange(opts: {
        key: string;
        start: number;
        stop: number;
    }): Promise<string[]>;
    lLen(opts: {
        key: string;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisModuleOption`

*interface*

`ioredis` is an optional peer, loaded when a client is built. A `bun build --compile` binary
carries no `node_modules` to load it from: pass the module here, or register it once with
`ModuleUtility.register({ modules: { ioredis } })` at the entry.

```ts
export interface IRedisModuleOption {
    module?: typeof import('ioredis');
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisNode`

*interface*

The address of one Redis node. A node has no credentials of its own: ioredis reads only the host and port of a Sentinel endpoint, and applies a cluster node's credentials to the startup nodes only.

```ts
export interface IRedisNode {
    host: string;
    /** @default RedisDefaults.PORT (6379), or RedisSentinelDefaults.PORT (26379) for a Sentinel node */
    port?: string | number;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisPubSub`

*interface*

Publish to many topics and subscribe on the helper client. `publish` serialises the payload as JSON and deflates it when `useCompress` is set.

```ts
export interface IRedisPubSub {
    publish<T>(opts: {
        topics: Array<string>;
        payload: T;
        useCompress?: boolean;
    }): Promise<void>;
    subscribe(opts: {
        topic: string;
    }): void;
    unsubscribe(opts: {
        topic: string;
    }): void;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisSentinelHelperOptions`

*interface*

Options for `RedisSentinelHelper`: connection props, lifecycle callbacks and an optional `ioredis` module.

```ts
export interface IRedisSentinelHelperOptions extends IRedisSentinelHelperProps, IRedisHelperCallbacks, IRedisModuleOption {
}
```

Source: `packages/helpers/src/modules/redis/sentinel/types.ts`
