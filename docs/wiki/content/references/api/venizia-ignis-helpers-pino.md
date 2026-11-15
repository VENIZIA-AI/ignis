---
title: "@venizia/ignis-helpers/pino"
description: "Every export of @venizia/ignis-helpers/pino, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/pino`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

10 exports, 10 with TSDoc.

## `IPinoLoggerOptions`

*interface*

Injection point for `setPinoBackingLogger()` - tests and advanced apps supply their own instance.

```ts
export interface IPinoLoggerOptions {
    instance?: TPinoInstance;
}
```

Source: `packages/helpers/src/modules/logger/pino/common/types.ts`

## `PINO_CUSTOM_LEVELS`

*const*

pino levels are ASCENDING severity (error 50 > warn 40 > info 30 > debug 20); `emerg`(70) extends above error. NORMATIVE - do not renumber without updating the spec.

```ts
export declare const PINO_CUSTOM_LEVELS: Record<TPinoCustomLevelName, number>;
```

Source: `packages/helpers/src/modules/logger/pino/common/constants.ts`

## `PinoBackingLogger`

*class*

Owns the single pino instance every scope writes through, and the transport thread behind it.

```ts
export declare class PinoBackingLogger {
    private static instance;
    /** The `ThreadStream` behind `instance`, held ONLY when built via a transport (pretty/roll) and `undefined` for `stdout` or an injected instance - tracked so a replacement can close the worker instead of orphaning it. */
    private static transport;
    /** Pure: pino constructor options derived from env at CALL time. Public so tests can build a REAL instance against an in-memory destination, without the impure singleton. */
    static buildOptions(): {
        name: string;
        level: import("../index.js").TLogLevel;
        customLevels: Record<"emerg", number>;
    };
    /** Lazy, env-driven singleton, built once and reused by every scope entirely synchronously - the very first log line already targets the real env-configured destination, no stdout bootstrap. `set()` is the only way to replace it; this getter never resets it. */
    static get(): TPinoInstance;
    /** Replaces the singleton outright: an outgoing transport-backed instance (pretty/roll) is a `ThreadStream` on a live worker thread, so this flushes then `.end()`s it first rather than orphaning the worker; failures are logged via `console.error`, never swallowed. */
    static set(opts: {
        instance: TPinoInstance;
    }): void;
    private static closeTransport;
}
```

Source: `packages/helpers/src/modules/logger/pino/backing.ts`

## `PinoDestination`

*class*

Reads `APP_ENV_LOGGER_*` and turns it into a destination. Warning prefixes name the operation, not the class - the tests and the published API still call these `mapFrequency`/`mapMaxFilesToCount`.

```ts
export declare class PinoDestination {
    private static readonly DEFAULT_FREQUENCY;
    private static readonly DEFAULT_MAX_FILES;
    /** `APP_ENV_LOGGER_FILE_FREQUENCY` -> pino-roll's `frequency`; an unrecognized value warns and falls back rather than throwing, so the app still boots. */
    static mapFrequency(opts: {
        value?: string;
    }): TFrequency;
    /** `null` means "not a recognized shape" - the caller decides what default to fall back to. */
    private static parseMaxFilesValue;
    /** `APP_ENV_LOGGER_FILE_MAX_FILES` -> pino-roll's `limit.count`: `'<n>d'` scales by frequency (hourly: days*24), a bare integer is a literal count, unrecognized falls back to `'5d'`. */
    static mapMaxFilesToCount(opts: {
        value?: string;
        frequency: TFrequency;
    }): number;
    /** Pure: which destination pino should write to, derived from `APP_ENV_LOGGER_*` at CALL time. `DATE_PATTERN` is deliberately not read - pino-roll has no equivalent. */
    static resolvePlan(): TDestinationPlan;
    /** `pino.transport()` is SYNCHRONOUS - it returns a `ThreadStream` that BUFFERS writes until its worker thread loads, so no async gating is needed; `ModuleUtility.assertInstalled` runs first so a missing optional peer fails loudly here, not as an opaque worker-thread crash. */
    static build(opts: {
        plan: TDestinationPlan;
    }): pino.DestinationStream | undefined;
}
```

Source: `packages/helpers/src/modules/logger/pino/destination.ts`

## `PinoFrequencies`

*class*

How often the file destination rolls (pino-roll's `frequency`).

```ts
export declare class PinoFrequencies {
    static readonly HOURLY = "hourly";
    static readonly DAILY = "daily";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/logger/pino/common/constants.ts`

## `PinoLogger`

*class*

pino provider satisfying `ILoggerProvider`, staying pino-native: numeric levels, `msg`, epoch `time`, pid/hostname pass through unchanged. No custom-instance param on `get()` unlike `WinstonLogger.get` - advanced/test injection goes through `PinoBackingLogger.set()`.

```ts
export declare class PinoLogger extends BaseLogger {
    private static cache;
    private constructor();
    static get(scope: string): PinoLogger;
    /** Resolves the backing instance at WRITE time and never caches it, so `PinoBackingLogger.set()` takes effect for every already-issued scope immediately. */
    protected write(opts: {
        level: TLogLevel;
        message: string;
        args: unknown[];
    }): void;
    protected child(opts: {
        scope: string;
    }): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/pino/logger.ts`

## `TDestinationPlan`

*type*

Pure description of where pino should write, derived from env; `PinoDestination.build()` is the impure half that acts on it.

```ts
export type TDestinationPlan = {
    kind: 'stdout';
} | {
    kind: 'pretty';
} | {
    kind: 'roll';
    options: {
        file: string;
        frequency: TFrequency;
        size: string;
        limit: {
            count: number;
        };
        mkdir: true;
    };
};
```

Source: `packages/helpers/src/modules/logger/pino/destination.ts`

## `TFrequency`

*type*

Valid pino roll frequency values.

```ts
export type TFrequency = TConstValue<typeof PinoFrequencies>;
```

Source: `packages/helpers/src/modules/logger/pino/common/constants.ts`

## `TPinoCustomLevelName`

*type*

Custom pino level NAMES layered on pino's four native levels so every `TLogLevel` name has a real method; `PINO_CUSTOM_LEVELS` in `./constants.ts` holds the NORMATIVE numeric floor.

```ts
export type TPinoCustomLevelName = 'emerg';
```

Source: `packages/helpers/src/modules/logger/pino/common/types.ts`

## `TPinoInstance`

*type*

The backing pino instance shape every `PinoLogger` writes through.

```ts
export type TPinoInstance = pino.Logger<TPinoCustomLevelName>;
```

Source: `packages/helpers/src/modules/logger/pino/common/types.ts`
