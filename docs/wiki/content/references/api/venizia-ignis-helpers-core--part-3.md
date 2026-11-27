---
title: "@venizia/ignis-helpers/core (3 of 4)"
description: "Every export of @venizia/ignis-helpers/core, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/core (3 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 4 of [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core).

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
    /**
     * A rejected value for an error message: a number as `String` writes it (`NaN`, `Infinity`; JSON would write
     * `null`), a string quoted and escaped, anything else as `EchoUtility.toSafeEcho` writes it. Longer than
     * `ECHO_LIMIT` characters, it is cut and ends with an ellipsis, so a long value cannot flood a log line.
     */
    private static echoRejected;
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
     * ParseUtility.toInt({ input: AppEnvs.get(KEY, { defaultValue: '6379' }) })  // correct
     * ParseUtility.toInt({ input: AppEnvs.get(KEY) }) ?? 6379                    // always 0 when KEY is unset
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
    /**
     * Reads a number from a value that should hold one, and refuses anything else: the read of an environment
     * variable, where `ParseUtility.toInt` answers `0` for garbage and `Number` answers `NaN`.
     *
     * - `undefined`, `null` and a blank string answer `undefined`: nothing was set, so a `defaultValue` applies.
     * - A decimal number as text answers its value. Surrounding whitespace is allowed (`' 12 '` is `12`), so is
     *   an exponent (`'1e3'` is `1000`), a sign (`'-5'`) and a fraction (`'.5'`, `'5.'`).
     * - Anything else throws: `'abc'`, `'12px'`, `'0x10'`, `'1,000'`, `'Infinity'`, `'NaN'`, a boolean or an object.
     *   A number that is not finite throws too; a finite number answers itself.
     *
     * @throws ApplicationError `[toNumber] <the value> is not a number`; the value is echoed escaped and cut at 40 characters.
     * @example
     * ```ts
     * AppEnvs.get(KEY, {
     *   transform: (raw) => ParseUtility.toNumber({ input: raw }),
     *   defaultValue: 6379,
     * });
     * ```
     */
    static toNumber(opts: {
        input: unknown;
    }): number | undefined;
    /**
     * Reads a boolean setting with the words of `z.stringbool()`, trimmed and in any case: `true`, `1`, `yes`, `on`,
     * `y`, `enabled` are `true`; `false`, `0`, `no`, `off`, `n`, `disabled` are `false`. A boolean is itself, the numbers
     * `1` and `0` read like their text, and `null`, `undefined` and a blank string are `false`.
     *
     * @param opts.name - The setting or field the value is read from; only the error message uses it.
     * @throws A 400 error for anything else, another number and `NaN` included.
     */
    static toBoolean(opts: {
        input: unknown;
        name?: string;
    }): boolean;
    /** Converts an array to a Map keyed by `key`. Last element wins on duplicate keys. */
    static parseArrayToMapWithKey<T extends Record<K, PropertyKey>, K extends keyof T>(opts: {
        items: T[];
        key: K;
    }): Map<T[K], T>;
    /** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped env values (e.g. `AppEnvs.get(KEY, { transform: (input) => ParseUtility.toDelimitedArray({ input }) })`). */
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
    static getDeepProperty(opts: {
        source: unknown;
        path: string;
    }): unknown;
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
    /** Fire-and-forget: routes rejection to `logger` (or the framework logger of `scope`), passes sync results through untouched. */
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

What `IQueryStringOptions.nested` does with an object or an array value.

```ts
export declare class QueryStringNestedModes {
    static readonly DROP = "drop";
    static readonly JSON = "json";
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.constant.ts`

## `QueryStringNullishModes`

*class*

What `IQueryStringOptions.nullish` does with a nullish value.

```ts
export declare class QueryStringNullishModes {
    static readonly EMPTY = "empty";
    static readonly SKIP = "skip";
}
```

Source: `packages/helpers/src/modules/network/utilities/query-string.constant.ts`

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
     * STRINGS "undefined" and "null", and a space encodes as `+` rather than `%20`. The first changes
     * what a server parses; the second is the same coercion that sends a header reading "undefined".
     *
     * Matches `node:querystring` (diffed across 22 shapes) except where this says otherwise: by default a
     * null or undefined pair is LEFT OUT (`nullish: 'skip'`; `'empty'` writes `a=`, what `node:querystring`
     * does), and an empty array writes nothing. `nested: 'json'` sends an object or an array as ONE JSON
     * parameter instead (an array does not repeat its key), so a filter object survives the trip. An
     * empty string is a value and is kept (`a=`).
     */
    static toQueryString(opts: {
        params: Record<string, unknown>;
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
export declare class RetryBackoffStrategies extends ConstClass {
    static readonly FIXED = "fixed";
    static readonly LINEAR = "linear";
    static readonly EXPONENTIAL = "exponential";
    /** An explicit per-attempt cap schedule, e.g. [250, 1000, 4000]; the last entry repeats. */
    static readonly SCHEDULE = "schedule";
}
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `RetryJitterModes`

*class*

How randomness is applied to a computed retry delay.

```ts
export declare class RetryJitterModes extends ConstClass {
    /** The computed delay is used as-is. */
    static readonly NONE = "none";
    /** Uniform random in [0, delay) - decorrelates a thundering herd hardest. */
    static readonly FULL = "full";
    /** delay/2 + uniform random in [0, delay/2) - jittered but never less than half the delay. */
    static readonly EQUAL = "equal";
}
```

Source: `packages/helpers/src/modules/retry/common/constants.ts`

## `RetryUtility`

*class*

Static members call each other through the class name (`RetryUtility.xxx`), never `this` - a
detached static method loses its `this` binding.

```ts
export declare class RetryUtility {
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
        shouldRetry?: (context: IRetryContext) => ValueOrPromise<boolean>;
        /** The least wait before the next attempt, in milliseconds (a server's `Retry-After`); the backoff delay applies when it is longer. `undefined` leaves the backoff alone. */
        getDelayMs?: (context: IRetryContext) => number | undefined;
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

Source: `packages/helpers/src/utilities/retry.utility.ts`

## `SlugUtility`

*class*

Vietnamese-aware slugging. See `D_STROKE_REPLACEMENTS` for why `đ` maps to `d` and not `dj`.

```ts
export declare class SlugUtility {
    static slugify(opts: {
        value: string;
    }): string;
}
```

Source: `packages/helpers/src/utilities/slug.utility.ts`

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

## `TFetcherResponse`

*type*

What a fetcher of this variant answers: a `Response` for `'native'`, an `AxiosResponse` for `'axios'`.

```ts
export type TFetcherResponse<T extends TFetcherVariant> = T extends 'native' ? Response : AxiosResponse<unknown>;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `TFetcherWorker`

*type*

The client a fetcher of this variant wraps (`getWorker()`): `fetch` or an axios instance.

```ts
export type TFetcherWorker<T extends TFetcherVariant> = T extends 'axios' ? AxiosInstance : typeof fetch;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `THttpHeaders`

*type*

A header map as a call or a default writes it: a `Headers`, `[name, value]` pairs or a record. In a record a `null` or `undefined` value removes that header (a default included); a number is sent as text.

```ts
export type THttpHeaders = Headers | Array<[string, string]> | Record<string, TNullable<string | number>>;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/common/types.ts`

## `TLogLevel`

*type*

One of the `LogLevels` values.

```ts
export type TLogLevel = TConstValue<typeof LogLevels>;
```

Source: `packages/helpers/src/modules/logger/common/types.ts`

## `TNativeFetchSender`

*type*

What sends a request when the fetcher is given one: the part of `fetch` it uses.

```ts
export type TNativeFetchSender = (url: string, init: RequestInit) => Promise<Response>;
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

## `TNativeRequestInit`

*type*

`RequestInit` as a fetcher takes it for the settings the pipeline does not own (`credentials`, `mode`, `cache`, ...).

```ts
export type TNativeRequestInit = Omit<RequestInit, TOwnedInitFields>;

/** The fields of `RequestInit` a call or a fetcher cannot set because the pipeline owns them. */
type TOwnedInitFields = 'body' | 'headers' | 'method' | 'signal' | 'redirect';
```

Source: `packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`

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

One of `QueryStringNestedModes`.

```ts
export type TQueryStringNestedMode = TConstValue<typeof QueryStringNestedModes>;
```

Source: `packages/helpers/src/modules/network/utilities/query-string.constant.ts`

## `TQueryStringNullishMode`

*type*

One of `QueryStringNullishModes`.

```ts
export type TQueryStringNullishMode = TConstValue<typeof QueryStringNullishModes>;
```

Source: `packages/helpers/src/modules/network/utilities/query-string.constant.ts`

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

## `TTrustedOrigin`

*type*

An origin written the way `new URL(origin).origin` writes it: scheme, host and a non-default port, nothing else.

```ts
export type TTrustedOrigin = `${TConstValue<typeof UrlSchemes>}//${string}`;
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/types.ts`

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
export declare class UidCaseForms extends ConstClass {
    static readonly UPPER = "upper";
    static readonly LOWER = "lower";
    static readonly MIXED = "mixed";
}
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `UidTokenEncodings`

*class*

How a token is written as text.

```ts
export declare class UidTokenEncodings extends ConstClass {
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
}
```

Source: `packages/helpers/src/modules/uid/common/constants.ts`

## `UrlBuilder`

*class*

Building the url of a request from a base and path segments, so a segment cannot leave the base.

```ts
export declare class UrlBuilder {
    /** The origin of the page or Web Worker that runs this, or `undefined` on a server: the browser global `location` is not declared for a server build, so it is probed. */
    static readLocationOrigin(): string | undefined;
    /** The base is an absolute url or a path from the origin (`/api`), and carries no query or fragment. */
    static assertBase(opts: {
        baseUrl: string;
        scope: string;
    }): void;
    /** The request paths name a place under the base path, so none may be a dot segment, hide one, or carry a separator the URL parser would read differently from a server. */
    static assertPaths(opts: {
        paths: ReadonlyArray<string>;
        scope: string;
    }): void;
    /** `baseUrl` (no trailing slash) followed by each path with one leading slash: `('/api/', ['a', '/b'])` is `/api/a/b`. */
    static toText(opts: {
        baseUrl: string;
        paths: ReadonlyArray<string>;
    }): string;
    /**
     * A call url as sent: an absolute one stays as it is, a relative one is joined to `baseUrl` by `join`, with its refusals.
     * Only the path part is checked, as `join` checks a path: the query and the fragment pass as they were written. An empty
     * path is the base itself, and a `//host/x` is a path under the base, never another host.
     */
    static resolve(opts: {
        baseUrl: string;
        url: string;
        scope: string;
    }): string;
    /**
     * The url of a request: the base and the paths, checked. A path may not be a dot segment, hide one, or carry a backslash
     * or a control character; a relative base (`/api`) is resolved against `origin` (the page's, by default); and the result
     * must be on the base's origin and under its path.
     */
    static join(opts: {
        baseUrl: string;
        paths: ReadonlyArray<string>;
        scope: string;
        origin?: string;
    }): URL;
    /** The resolved URL, whatever built it, is on the base's origin and under its path: the check that holds when the text checks above miss a form. */
    static assertUnderBase(opts: {
        url: URL;
        baseUrl: string;
        origin?: string;
        scope: string;
    }): void;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-builder.ts`

## `UrlFetchError`

*class*

The upstream answered, and the answer is not one a fetcher returns: a status `acceptStatus` refuses (a 4xx or 5xx
by default), or a redirect it was not allowed to follow (`maxRedirects: 0`, or a `Location` that is not a url).
`status` is the upstream's; `statusCode` (inherited) is the one this server answers with, and stays 400. `response` carries the first 64 KiB
of the body, still readable, and the socket is free.

```ts
export declare class UrlFetchError<R = Response> extends ApplicationError {
    /** How much of a refused answer's body stays readable on `response`. */
    static readonly MAX_BODY_BYTES: number;
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
    });
    /** Whether `error` is a `UrlFetchError`: the shape a caller narrows on before it reads `status`. */
    static is(error: unknown): error is UrlFetchError<unknown>;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/errors.ts`
