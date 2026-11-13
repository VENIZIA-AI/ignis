---
title: "@venizia/ignis-helpers/winston"
description: "Every export of @venizia/ignis-helpers/winston, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/winston`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

9 exports, 9 with TSDoc.

## `applicationLogFormatter`

*const*

The winston format that renders an application log line; the default logger uses it.

```ts
export declare const applicationLogFormatter: winston.Logform.Format;
```

Source: `packages/helpers/src/modules/logger/winston/define.ts`

## `DgramTransport`

*class*

Winston transport that sends the lines of the configured levels as UDP datagrams. A send failure is reported to the console and the socket is reopened on the next line; it never throws. `fromPartial` returns `null` when `label`, `host`, `port`, `levels` or `socketOptions` is missing.

```ts
export declare class DgramTransport extends Transport {
    private label;
    private host;
    private port;
    private triggerLevels;
    private socketOptions;
    private client;
    constructor(opts: IDgramTransportOptions);
    static fromPartial(opts?: Partial<IDgramTransportOptions>): DgramTransport | null;
    private establish;
    private formatMessage;
    log(opts: {
        level: string;
        message: string;
        label?: string;
        timestamp?: string;
        [extra: symbol]: unknown;
    }, callback: () => void): void;
}
```

Source: `packages/helpers/src/modules/logger/winston/transports/dgram.transport.ts`

## `ICustomLoggerOptions`

*interface*

Options for building a winston logger; `transports.info` and `transports.error` each take an optional file and datagram transport.

```ts
export interface ICustomLoggerOptions {
    levels?: {
        [name: string | symbol]: number;
    };
    colors?: {
        [name: string | symbol]: string;
    };
    /** Full override of the logger-level format; when provided, transports get NO format of their own - the override is applied once for every transport, exactly as it produces the line. */
    formatter?: ReturnType<typeof winston.format.combine>;
    /**
     * Output shape per transport.
     * @default the `APP_ENV_LOGGER_FORMAT` setting, else `'text'`
     */
    format?: TLoggerFormat;
    /**
     * Logger-level floor.
     * @default the `APP_ENV_LOGGER_LEVEL` setting, else `'debug'`
     */
    level?: TLogLevel;
    /**
     * ANSI color on the console transport in `text` mode. Ignored when `formatter` is set - that override owns the whole line.
     * @default the `APP_ENV_LOGGER_COLOR` setting; else `false` under `NO_COLOR` or outside a development `NODE_ENV`; else `true`
     */
    colorize?: boolean;
    transports: {
        info: {
            file?: IFileTransportOptions;
            dgram?: Partial<IDgramTransportOptions>;
        };
        error: {
            file?: IFileTransportOptions;
            dgram?: Partial<IDgramTransportOptions>;
        };
    };
}
```

Source: `packages/helpers/src/modules/logger/winston/common/types.ts`

## `IDgramTransportOptions`

*interface*

Options of `DgramTransport`. Only lines whose level is in `levels` are sent, as UDP datagrams to `host:port`, tagged with `label`; `socketOptions` go to `dgram.createSocket`.

```ts
export interface IDgramTransportOptions extends Transport.TransportStreamOptions {
    label: string;
    host: string;
    port: number;
    levels: Array<string>;
    socketOptions: dgram.SocketOptions;
}
```

Source: `packages/helpers/src/modules/logger/winston/common/types.ts`

## `IFileTransportOptions`

*interface*

Daily-rotating log file written to `<folder>/<prefix>-<level>-%DATE%.log`.

```ts
export interface IFileTransportOptions {
    prefix: string;
    folder: string;
    /**
     * How often the file rotates.
     * @default the `APP_ENV_LOGGER_FILE_FREQUENCY` setting, else `'1h'`
     */
    frequency?: string;
    /**
     * Size at which a file rotates.
     * @default the `APP_ENV_LOGGER_FILE_MAX_SIZE` setting, else `'100m'`
     */
    maxSize?: string;
    /**
     * How many files, or days of files, are kept.
     * @default the `APP_ENV_LOGGER_FILE_MAX_FILES` setting, else `'5d'`
     */
    maxFiles?: string;
    /**
     * The date format in the file name.
     * @default the `APP_ENV_LOGGER_FILE_DATE_PATTERN` setting, else `'YYYYMMDD_HH'`
     */
    datePattern?: string;
}
```

Source: `packages/helpers/src/modules/logger/winston/common/types.ts`

## `Logger`

*class*

`ILogger` backed by winston, obtained with `get(scope)`; also exported as `Logger`. Lines below the winston logger level are skipped before formatting.

```ts
export declare class WinstonLogger extends BaseLogger {
    private static cache;
    private readonly _logger;
    private constructor();
    /** Default-backed loggers are cached per scope; a custom-backed logger is a fresh wrapper every call - a scope-keyed cache can't tell different winston instances apart. */
    static get(scope: string, customLogger?: winston.Logger): WinstonLogger;
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

Source: `packages/helpers/src/modules/logger/winston/logger.ts`

## `WinstonFormatFactory`

*class*

Static methods never reach a sibling through `this` - the exported names in `define.ts` are
unbound aliases (`WinstonFormatFactory.method`), so `this` would be `undefined` there.

```ts
export declare class WinstonFormatFactory {
    /** Per-line prep: label, timestamp, error normalization, deep splat. Final-string assembly is per-transport, so console can colorize while files/UDP get plain lines. */
    static prep(opts: {
        label: string;
    }): winston.Logform.Format;
    /** Drop-in replacement for `winston.format.splat()` that formats through {@link LogFormatUtility.formatMessage}; every transport reads `info.message`, so widening it here widens console, file and dgram at once. */
    static deepSplat(): winston.Logform.Format;
    static textLine(): winston.Logform.Format;
    static json(opts: {
        label: string;
    }): winston.Logform.Format;
    static pretty(opts: {
        label: string;
        colorize?: boolean;
    }): winston.Logform.Format;
    static log(opts: {
        label: string;
        format?: TLoggerFormat;
    }): winston.Logform.Format;
    /** Per-transport assembly formats: console may colorize, a file never does - ANSI bytes in a rotated log file are noise every grep has to strip. */
    static assembly(opts: {
        format: TLoggerFormat;
        colorize: boolean;
    }): {
        console: winston.Logform.Format;
        file: winston.Logform.Format;
    };
    static readonly applicationLogFormatter: winston.Logform.Format;
}
```

Source: `packages/helpers/src/modules/logger/winston/formats.ts`

## `WinstonLogger`

*class*

`ILogger` backed by winston, obtained with `get(scope)`; also exported as `Logger`. Lines below the winston logger level are skipped before formatting.

```ts
export declare class WinstonLogger extends BaseLogger {
    private static cache;
    private readonly _logger;
    private constructor();
    /** Default-backed loggers are cached per scope; a custom-backed logger is a fresh wrapper every call - a scope-keyed cache can't tell different winston instances apart. */
    static get(scope: string, customLogger?: winston.Logger): WinstonLogger;
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

Source: `packages/helpers/src/modules/logger/winston/logger.ts`

## `WinstonLoggerFactory`

*class*

Static methods never reach a sibling through `this` - the exported names in `define.ts` are
unbound aliases (`WinstonLoggerFactory.method`), so `this` would be `undefined` there.

```ts
export declare class WinstonLoggerFactory {
    private static _defaultLogger?;
    static defineCustomLogger(opts: ICustomLoggerOptions): winston.Logger;
    /** Default transports from `APP_ENV_LOGGER_*`, resolved at CALL time. File logging is opt-in - without `APP_ENV_LOGGER_FOLDER_PATH` no rotating file is created. */
    static resolveDefaultTransportOptions(): ICustomLoggerOptions['transports'];
    /**
     * Lazy and cached - a plain module-level eager instance would build a winston logger (and read
     * env vars) at import time for every consumer of the barrel, even one that never logs through
     * the default.
     */
    static defaultLogger(): winston.Logger;
}
```

Source: `packages/helpers/src/modules/logger/winston/logger-factory.ts`
