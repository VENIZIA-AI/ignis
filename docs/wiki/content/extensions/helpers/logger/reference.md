---
title: Logger - Full Reference
description: Complete reference for Logger, LoggerFactory, HfLogger, transports, formatters, and every APP_ENV_LOGGER_* environment variable
difficulty: intermediate
---

# Logger - Full Reference

Exhaustive reference for `Logger`, `LoggerFactory`, `HfLogger`/`HfLogFlusher`, the Winston formatter and transport internals, and every environment variable. For a readable introduction and the common tasks, start with the [Logger overview](/extensions/helpers/logger/).

The default provider is **Winston** (with `winston-daily-rotate-file` for file rotation). All provider packages are OPTIONAL peers - an application loads exactly ONE provider (single-provider loading, below).

**Files:**

- [`packages/helpers/src/modules/logger/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/common/types.ts) - `ILogger`, `TLogLevel`, `TLoggerFormat`
- [`packages/helpers/src/modules/logger/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/common/constants.ts) - `LogLevels`, `LoggerFormats`
- [`packages/helpers/src/modules/logger/base/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/base/abstract.ts) - `AbstractLogger`
- [`packages/helpers/src/modules/logger/base/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/base/base.ts) - `BaseLogger`
- [`packages/helpers/src/modules/logger/formatting/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/formatting/deep-splat.ts) - `formatLogMessage`, `%s` inspection widening
- [`packages/helpers/src/modules/logger/winston/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/logger.ts) - `WinstonLogger`, `Logger` alias
- [`packages/helpers/src/modules/logger/winston/define.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/define.ts) - `defineCustomLogger`, formatters
- [`packages/helpers/src/modules/logger/winston/formatters/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/formatters/deep-splat.ts) - `deepSplat`
- [`packages/helpers/src/modules/logger/winston/transports/dgram.transport.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/transports/dgram.transport.ts) - `DgramTransport`
- [`packages/helpers/src/modules/logger/hf/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/logger.ts) - `HfLogger`
- [`packages/helpers/src/modules/logger/hf/flusher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/flusher.ts) - `HfLogFlusher`
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory`, `ApplicationLogger`

## Architecture & ILogger

The module follows IGNIS's house format: `common/` (the contract), `base/` (provider-independent plumbing), `winston/` (the built-in provider), `hf/` (the separate high-frequency logger), and a top-level `factory.ts` as the single acquisition path.

```
ILogger (interface)                common/types.ts
  └─ AbstractLogger (abstract)     base/abstract.ts    - the contract as a class, for `instanceof`
       └─ BaseLogger (abstract)    base/base.ts         - scope, prefix, DEBUG gate, .for(), one write() sink
            ├─ WinstonLogger       winston/logger.ts      - the built-in provider (default)
            └─ PinoLogger          pino/logger.ts          - sub-path @venizia/ignis-helpers/pino
```

- **Consumers type against `ILogger`, never a concrete class.** `LoggerFactory.getLogger()` and `BaseHelper.logger` both return `ILogger`. Which provider produced the instance stays invisible behind the interface.
- **Provider registration.** `LoggerFactory.use({ provider })` selects the application's provider (default: `WinstonLogger`). The factory hands out stable delegating wrappers and re-points ALL of them when `use()` is called - even module-level loggers captured at import time follow the registration; the per-call cost is one property read (measured ~0ns).
- **Single-provider loading.** Exactly ONE provider is ever loaded. Delegates resolve lazily at the first log call, so an app that registers pino at its entrypoint never loads winston. The winston default loads only when `use()` was never called by the first log line - it requires the winston peers installed (`bun add winston winston-transport winston-daily-rotate-file`). Compiled binaries (`bun build --compile`) must ALWAYS register a provider explicitly: only a class reference carries a provider into a bundle.
- **Both providers are sub-path only**: `WinstonLogger` at `@venizia/ignis-helpers/winston`, `PinoLogger` at `@venizia/ignis-helpers/pino` ([guide](/extensions/helpers/logger/pino)). The root barrel is provider-free; importing it loads neither.

**Which names follow `use()`:**

| Name | Is | Follows `use()`? |
|---|---|---|
| `LoggerFactory.getLogger()` / `BaseHelper.logger` | delegating wrapper | YES |
| `ApplicationLogger.get()` | facade over the factory; type = `ILogger` | YES |
| `Logger` / `Logger.get(scope, customWinston?)` | concrete `WinstonLogger` (instanceof, custom winston instances) | NO - names winston deliberately |
| `WinstonLogger` / `PinoLogger` | concrete providers | are the targets |

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| `Logger` | `BaseLogger` -> `AbstractLogger` (`ILogger`) | General-purpose scoped logger with caching (permanent alias of `WinstonLogger`) |
| `LoggerFactory` | - | Provider registration (`use`) + `ILogger` acquisition from scope arrays |
| `PinoLogger` | `BaseLogger` (`ILogger`) | Throughput provider - NDJSON, sub-path only ([guide](/extensions/helpers/logger/pino)) |
| `HfLogger` | `AbstractLogger` (`ILogger`) | Ring-buffer logger for hot paths - bytes path ~59ns, string no-args path ~66ns |
| `HfLogFlusher` | - | Background flusher for `HfLogger` entries |
| `DgramTransport` | `winston-transport.Transport` | Custom Winston transport that sends logs over UDP |

### Import paths

```typescript
// Core classes - provider-neutral, root barrel
import { LoggerFactory, ApplicationLogger } from '@venizia/ignis-helpers';
import type { ILogger } from '@venizia/ignis-helpers';

// Abstract tiers - implementing ILogger yourself, or instanceof checks
import { AbstractLogger, BaseLogger } from '@venizia/ignis-helpers';

// High-frequency logger
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// Constants & types
import { LogLevels, LoggerFormats } from '@venizia/ignis-helpers';
import type { TLogLevel, TLoggerFormat } from '@venizia/ignis-helpers';

// Level resolution - provider-neutral
import { resolveLoggerLevel } from '@venizia/ignis-helpers';

// Winston provider + its utilities - SUB-PATH only (winston is an optional peer)
import {
  Logger,
  WinstonLogger,
  defineCustomLogger,
  defineLogFormatter,
  defineJsonLoggerFormatter,
  definePrettyLoggerFormatter,
  applicationLogFormatter,
  resolveDefaultTransportOptions,
} from '@venizia/ignis-helpers/winston';
import type { IFileTransportOptions, ICustomLoggerOptions } from '@venizia/ignis-helpers/winston';

// Pino provider - SUB-PATH only (optional peers: pino, pino-pretty, pino-roll)
import { PinoLogger, setPinoBackingLogger } from '@venizia/ignis-helpers/pino';
import type { ILoggerProvider } from '@venizia/ignis-helpers';

// UDP transport (winston)
import { DgramTransport } from '@venizia/ignis-helpers/winston';
import type { IDgramTransportOptions } from '@venizia/ignis-helpers/winston';
```

The root barrel is provider-free: importing `@venizia/ignis-helpers` loads NO provider. Winston names resolve only through `@venizia/ignis-helpers/winston`, pino names only through `@venizia/ignis-helpers/pino`.

## Creating an Instance

`Source ->` [`winston/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/logger.ts), [`factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts)

### Using LoggerFactory (recommended)

`LoggerFactory.getLogger` accepts an array of scope strings, joins them with `-`, and returns a cached provider-following wrapper (see the name/role table above).

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['MyService']);
logger.info('Service initialized');
// Output: [MyService] Service initialized

const scopedLogger = LoggerFactory.getLogger(['Payment', 'Stripe']);
scopedLogger.info('Charge created');
// Output: [Payment-Stripe] Charge created
```

### Using Logger.get() directly

```typescript
import { Logger } from '@venizia/ignis-helpers/winston';

const logger = Logger.get('MyService');
logger.info('Direct logger access');
// Output: [MyService] Direct logger access
```

Pass a custom Winston logger instance as the second parameter to use your own transport configuration:

```typescript
import { Logger, defineCustomLogger, applicationLogFormatter } from '@venizia/ignis-helpers/winston';

const customWinstonLogger = defineCustomLogger({
  formatter: applicationLogFormatter,
  transports: {
    info: { file: { prefix: 'custom', folder: './logs' } },
    error: { file: { prefix: 'custom-error', folder: './logs' } },
  },
});

const logger = Logger.get('MyService', customWinstonLogger);
```

A custom-backed `Logger` is a fresh wrapper on every call - a scope-keyed cache cannot tell two different Winston instances apart, and the wrapper is cheap enough not to need one. `.for()` on a custom-backed logger keeps the same Winston instance.

### Logger caching

Without a custom logger, both `Logger.get` and `LoggerFactory.getLogger` cache internally - the same scope always returns the same `Logger` instance:

```typescript
const logger1 = Logger.get('MyService');
const logger2 = Logger.get('MyService');
// logger1 === logger2 (same instance)

const custom1 = Logger.get('MyService', customWinstonLogger);
const custom2 = Logger.get('MyService', customWinstonLogger);
// custom1 !== custom2 (fresh wrapper each call, same backing Winston instance)
```

### ApplicationLogger - the provider-following facade

`ApplicationLogger` is "the APPLICATION's logger": `ApplicationLogger.get(scope)` always returns the provider registered via `LoggerFactory.use()` (winston unless the app registered another). Its TYPE is `ILogger`. It is no longer a class alias of `WinstonLogger` - `instanceof ApplicationLogger` is now a compile error (use `instanceof AbstractLogger` to test any provider instance); the concrete alias remains available as `Logger`.

```typescript
import { ApplicationLogger } from '@venizia/ignis-helpers';

const logger = ApplicationLogger.get('MyService'); // ILogger, follows LoggerFactory.use()
```

The old scope-less `applicationLogger` instance was REMOVED - use `ApplicationLogger.get('YourScope')`; apps that need a raw winston instance build one with `defineCustomLogger` (sub-path `/winston`).

## Log Levels

`Source ->` [`common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/common/constants.ts), [`base/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/base/base.ts), [`winston/define.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/define.ts)

Five levels, each with a direct method on `ILogger`: `debug`, `info`, `warn`, `error`, `emerg`. The generic `log(level, ...)` remains for dynamic level selection.

```typescript
logger.info('User created');
logger.warn('Rate limit approaching');
logger.error('Failed to process payment');
logger.emerg('System out of memory');
logger.debug('Query took 12ms');           // Requires DEBUG=true
logger.log('warn', 'Threshold exceeded');   // Generic method for any level
```

### What each level means

The level set follows the npm/winston convention. Lower priority number = more severe; the level floor (`APP_ENV_LOGGER_LEVEL`) admits everything at or above its severity.

| Level | Priority | Meaning | Use it for |
|-------|----------|---------|------------|
| `error` | 0 | An operation failed | Caught failures the line exists to diagnose - always pair an `Error` with `%s` |
| `emerg` | 0 | The process is in a fatal state | Out-of-memory, unrecoverable corruption, imminent shutdown |
| `warn` | 1 | Something is off but handled | Retries, fallbacks taken, deprecated usage |
| `info` | 2 | A business event happened | "Order created", lifecycle milestones, boot phases |
| `debug` | 3 | Developer diagnostics | Values and timings useful only while developing - ALSO gated by `DEBUG` env |

> [!NOTE]
> Two gates apply to `debug`, one to everything else. Every level passes the floor (`APP_ENV_LOGGER_LEVEL`, default `debug` - which admits ALL five levels); `debug()` additionally requires the `DEBUG` env gate. The vocabulary was deliberately trimmed to these five (2026-07-18): `alert`/`http`/`verbose`/`silly` had zero call sites and no consuming infrastructure - `http` returns as an access-line level if the request-correlation feature lands.

`LogLevels` defines all available levels and provides validation:

```typescript
import { LogLevels } from '@venizia/ignis-helpers';
import type { TLogLevel } from '@venizia/ignis-helpers';

LogLevels.ERROR;   // 'error'
LogLevels.EMERG;   // 'emerg'
LogLevels.WARN;    // 'warn'
LogLevels.INFO;    // 'info'
LogLevels.DEBUG;   // 'debug'

LogLevels.isValid('info');    // true
LogLevels.isValid('unknown'); // false

const level: TLogLevel = 'info';
```

### Winston level priority

`defineCustomLogger` configures Winston with these numeric priorities by default:

| Level | Priority | Color |
|-------|----------|-------|
| `error` | 0 | red |
| `emerg` | 0 | red |
| `warn` | 1 | yellow |
| `info` | 2 | green |
| `debug` | 3 | blue |

Lower numeric values have higher priority. `error` and `emerg` share priority `0`.

## Method-Scoped Logging

`.for()` creates a sub-scoped logger for a specific method, appending the method name to the scope with a `-` separator, backed by the same provider instance as the parent. Default-backed results are cached.

```typescript
class UserService {
  private logger = LoggerFactory.getLogger(['UserService']);

  async createUser(data: CreateUserDto) {
    this.logger.for('createUser').info('Creating user: %j', data);
    // Output: [UserService-createUser] Creating user: {...}

    try {
      const user = await this.userRepo.create({ data });
      this.logger.for('createUser').info('User created: %s', user.id);
      return user;
    } catch (error) {
      this.logger.for('createUser').error('Failed to create user: %s', error);
      throw error;
    }
  }
}
```

## Message Formatting

`Source ->` [`winston/formatters/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/formatters/deep-splat.ts), [`formatting/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/formatting/deep-splat.ts)

### Logging errors: `%s`, never `%j`

- **`message` and `stack` are non-enumerable** on a native `Error`.
- **`%j` formats via `JSON.stringify`**, which only visits enumerable own properties, so `logger.error('Failed: %j', error)` silently drops both `message` and `stack` - the two fields the log line exists to capture.
- **Always pair an `Error` argument with `%s`**; reserve `%j`/`%o` for plain data objects.

```typescript
// Good - %s prints message + stack
logger.error('Failed to create user: %s', error);

// Bad - %j drops message and stack (non-enumerable on Error)
logger.error('Failed to create user: %j', error);
```

### Object inspection depth for `%s`

- **Node hard-codes `depth: 0` for `%s`** in `util.format` - an object passed to `%s` collapses to `[Object]`, hiding the nested `extra` or `cause` a wrapped error carries.
- **`deepSplat` widens that depth.** The formatter (`formatLogMessage`) pre-inspects any object bound to a `%s` placeholder before handing the message to Winston, so nested fields print instead of collapsing.
- **Applies per-placeholder.** Only arguments matched to a `%s` token are affected, so `%j` still gets `JSON.stringify` semantics.

```typescript
logger.error('Failed: %s', error); // nested `error.cause` is now visible, not `[Object]`
```

The inspection depth defaults to `5` and is configurable via `APP_ENV_LOGGER_INSPECT_DEPTH`:

```bash
APP_ENV_LOGGER_INSPECT_DEPTH=8
```

The value must be a non-negative integer. An absent, empty, negative, or unparseable value falls back to the default of `5` - there is no "unlimited" setting.

### Log formats

Output format is controlled by `APP_ENV_LOGGER_FORMAT` (default: `text`). `LoggerFormats` provides constants and validation:

```typescript
import { LoggerFormats } from '@venizia/ignis-helpers';
import type { TLoggerFormat } from '@venizia/ignis-helpers';

LoggerFormats.JSON;              // 'json'
LoggerFormats.TEXT;              // 'text'
LoggerFormats.isValid('json');   // true

const fmt: TLoggerFormat = 'text';
```

**JSON format** (`APP_ENV_LOGGER_FORMAT=json`):

```json
{"level":"info","message":"[UserService] User created","timestamp":"2024-01-11T10:30:00.000Z","label":"APP"}
```

**Pretty text format** (`APP_ENV_LOGGER_FORMAT=text`, default):

```
2024-01-11T10:30:00.000Z [APP] info: [UserService] User created
```

> [!NOTE]
> The label shown in log output (e.g. `APP`) comes from `APP_ENV_APPLICATION_NAME` (defaults to `'APP'`). Set this env var to customize the label for your application.

### Custom formatters

Build formatters directly using the exported helper functions:

```typescript
import {
  defineLogFormatter,
  defineJsonLoggerFormatter,
  definePrettyLoggerFormatter,
} from '@venizia/ignis-helpers';

// Auto-detect from APP_ENV_LOGGER_FORMAT (or override with format option)
const formatter = defineLogFormatter({ label: 'my-app' });
const jsonFmt = defineLogFormatter({ label: 'my-app', format: 'json' });

// Or use specific formatters directly
const jsonFormatter = defineJsonLoggerFormatter({ label: 'my-app' });
const prettyFormatter = definePrettyLoggerFormatter({ label: 'my-app' });
const plainFormatter = definePrettyLoggerFormatter({ label: 'my-app', colorize: false });
```

`defineLogFormatter` throws an `ApplicationError` if `format` (or `APP_ENV_LOGGER_FORMAT`) is not `'json'` or `'text'`.

## Transports

`Source ->` [`winston/define.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/define.ts)

Every logger created by `defineCustomLogger` always includes a **Console** transport, which inherits the logger-level floor (`APP_ENV_LOGGER_LEVEL`, default `debug`). File and UDP transports are optional and are registered per transport group (`info`, `error`).

Formatting is split in two stages: a shared preparation format on the logger (label, timestamp, error normalization, deep splat) and a per-transport assembly format. In `text` mode the console assembly colorizes while the file assembly does not - log FILES never contain ANSI color codes. In `json` mode every transport assembles with plain `format.json()`. Passing `formatter` disables the split: that one format produces the final line for every transport.

### File rotation (DailyRotateFile)

Configure file rotation through environment variables or programmatically via `IFileTransportOptions`.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FOLDER_PATH` | _(unset)_ | Log files directory; file logging is OFF when unset |
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |

**Programmatic configuration:**

```typescript
import { defineCustomLogger, applicationLogFormatter } from '@venizia/ignis-helpers/winston';

const customLogger = defineCustomLogger({
  formatter: applicationLogFormatter,
  transports: {
    info: {
      file: {
        prefix: 'my-app',
        folder: './logs',
        frequency: '24h',
        maxSize: '500m',
        maxFiles: '30d',
        datePattern: 'YYYYMMDD',
      },
    },
    error: {
      file: {
        prefix: 'my-app-error',
        folder: './logs',
        maxFiles: '90d',
      },
    },
  },
});
```

Generated filename pattern: `{folder}/{prefix}-info-{DATE}.log` or `{folder}/{prefix}-error-{DATE}.log`. An `error`-level file transport is also registered as a Winston exception handler.

#### IFileTransportOptions

```typescript
interface IFileTransportOptions {
  prefix: string;       // Filename prefix (required)
  folder: string;       // Output directory (required)
  frequency?: string;   // Rotation frequency (default: '1h')
  maxSize?: string;     // Max file size (default: '100m')
  maxFiles?: string;    // Retention period (default: '5d')
  datePattern?: string; // Date pattern in filename (default: 'YYYYMMDD_HH')
}
```

### UDP transport (DgramTransport)

`Source ->` [`winston/transports/dgram.transport.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/transports/dgram.transport.ts)

`DgramTransport` is a custom Winston transport that sends log entries over UDP. It filters by level - only messages whose level is in the configured `levels` set are forwarded.

```typescript
import { DgramTransport } from '@venizia/ignis-helpers/winston';

const transport = new DgramTransport({
  label: 'my-app',
  host: '127.0.0.1',
  port: 5000,
  levels: ['error', 'warn', 'info'],
  socketOptions: { type: 'udp4' },
});
```

**Static factory with validation** - `fromPartial` returns `null` if any required field is missing, rather than throwing:

```typescript
const transport = DgramTransport.fromPartial({
  label: 'my-app',
  host: '127.0.0.1',
  port: 5000,
  levels: ['error', 'warn'],
  socketOptions: { type: 'udp4' },
});
// Returns null if label, host, port, levels (non-empty), or socketOptions is missing
```

On a socket error the transport closes and nulls its client; the next `log()` call re-establishes the socket before sending. A failed `send` is logged to the console and the socket is dropped for reconnection - it is never re-emitted as an `'error'` event, so one lost UDP log line can never crash the process.

**Environment variables for the default application logger:**

| Variable | Description |
|----------|-------------|
| `APP_ENV_LOGGER_DGRAM_HOST` | UDP log aggregator host |
| `APP_ENV_LOGGER_DGRAM_PORT` | UDP log aggregator port |
| `APP_ENV_LOGGER_DGRAM_LABEL` | Label to identify log source |
| `APP_ENV_LOGGER_DGRAM_LEVELS` | Comma-separated levels to send via UDP |

#### IDgramTransportOptions

```typescript
interface IDgramTransportOptions extends Transport.TransportStreamOptions {
  label: string;                      // Label to identify log source
  host: string;                       // UDP host
  port: number;                       // UDP port
  levels: Array<string>;              // Levels to forward over UDP
  socketOptions: dgram.SocketOptions; // Node.js dgram socket options
}
```

### ICustomLoggerOptions

```typescript
interface ICustomLoggerOptions {
  levels?: { [name: string | symbol]: number };
  colors?: { [name: string | symbol]: string };
  // Full override: applied once for every transport, exactly as it produces the line
  formatter?: ReturnType<typeof winston.format.combine>;
  format?: TLoggerFormat; // 'json' | 'text'; defaults to APP_ENV_LOGGER_FORMAT
  level?: TLogLevel;      // logger-level floor; defaults to APP_ENV_LOGGER_LEVEL, then 'debug'
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

- **Both `info` and `error` transport groups support optional `file` (DailyRotateFile) and `dgram` (UDP) transports.**
- **A console transport is always included**, regardless of what is configured.
- **Error file transports double as Winston exception handlers.**

## Debug Logging Behavior

`Source ->` [`base/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/base/base.ts)

Debug logs require **both** conditions to be met:

1. `DEBUG=true` environment variable is set (parsed via `toBoolean`)
2. `NODE_ENV` is either unset **or** is present in the `Environment.COMMON_ENVS` set

`COMMON_ENVS` includes: `local`, `debug`, `development`, `dev`, `sit`, `uat`, `alpha`, `beta`, `staging`, `production`. Extend this set with `APP_ENV_EXTRA_LOG_ENVS`:

```bash
DEBUG=true
NODE_ENV=development
APP_ENV_EXTRA_LOG_ENVS=qa,preview   # Comma-separated additional environments
```

> [!IMPORTANT]
> The debug flag check is pre-computed at module load time. Changing `DEBUG` or `NODE_ENV` at runtime has no effect - the values are captured once when the module is first imported.

## High-Frequency Logger (HfLogger)

`Source ->` [`hf/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/logger.ts), [`hf/flusher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/flusher.ts)

For performance-critical applications (e.g. HFT systems, game servers), `HfLogger` provides ring-buffer logging with a 59.4ns bytes-path enqueue and a 66.0ns string no-args enqueue (Bun 1.3.14, 1M-iteration median). It extends `AbstractLogger` and implements `ILogger`, so it can be used anywhere an `ILogger` is expected - but it is still entirely separate from the Winston-backed `Logger` pipeline: no formatters, transports, or `APP_ENV_LOGGER_*` env vars apply to it. Read the [HfLogger guide](/extensions/helpers/logger/hf-logger) before using it - it carries hard usage rules (pre-encoded fixed message vocabulary, single-thread only, flush-interval sizing) and documented limitations.

```typescript
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// At initialization time (once):
const logger = HfLogger.get('OrderEngine');
const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');
const MSG_ORDER_FILLED = HfLogger.encodeMessage('Order filled');

// Start background flusher
const flusher = new HfLogFlusher();
flusher.start(100); // Flush every 100ms

// In hot path (bytes path, ~59ns, no allocation):
logger.log('info', MSG_ORDER_SENT);
logger.log('info', MSG_ORDER_FILLED);

// ILogger surface also works (string no-args path, ~66ns on a cache hit):
logger.info('Order sent');

// Shutdown:
await flusher.flush();
flusher.stop();
```

### HfLogger API

`HfLogger` implements the full `ILogger` contract plus its own static/bytes surface:

| Method | Signature | Description |
|--------|-----------|--------------|
| `HfLogger.get` | `(scope: string) => HfLogger` | Get or create a cached logger instance (allocates the ring lazily on first call) |
| `HfLogger.encodeMessage` | `(msg: string) => Uint8Array` | Pre-encode a message string to bytes; FIFO-bounded cache, cap `MESSAGE_CACHE_CAP = 4096` |
| `logger.debug/info/warn/error/emerg` | `(message: string, ...args: AnyType[]) => void` | `ILogger` methods. No args: cache-lookup encode + bytes-path write. With args: `formatLogMessage` (deep inspection + redaction) then an uncached encode - the slow path |
| `logger.log` | `(level: TLogLevel, message: string, ...args: AnyType[]) => void`<br>`(level: TLogLevel, messageBytes: Uint8Array) => void` | Overloaded: string form follows the `debug`/`info`/... cost model above; `Uint8Array` form is the legacy bytes hot path, unchanged signature |
| `logger.for` | `(methodName: string) => ILogger` | Returns `HfLogger.get(`${scope}-${methodName}`)`, same dash composition as `BaseLogger` |

Supported levels (`TLogLevel`, full set): `debug` (0), `info` (1), `warn` (2), `error` (3), `emerg` (4).

### HfLogFlusher API

| Method | Signature | Description |
|--------|-----------|--------------|
| `new HfLogFlusher` | `(options?: IHfLogFlusherOptions) => HfLogFlusher` | `sink?: THfSink` (full custom delivery), `filePath?: string` (default sink appends here instead of stdout), `batchSize?: number` (entries rendered per batch before yielding, default `1024`; invalid values fall back with a `console.warn`) |
| `flusher.flush` | `() => Promise<void>` | Drain the full backlog in bounded batches, yielding (`setImmediate`) between batches; re-entrant calls return the in-progress promise |
| `flusher.start` | `(intervalMs?: number) => void` | Start a background `setInterval` flush loop (default `100`ms), unref'd so it never blocks process exit; idempotent - calling again restarts cleanly |
| `flusher.stop` | `() => void` | Clear the interval started by `start()` |

`THfSinkBatch` passed to a custom `sink`: `{ lines: Array<string>; dropped: number }` - `dropped` is the exact count of entries overwritten by the ring before the flusher could read them since the previous batch (see "Lap accounting" in the guide). The default sink (no `filePath`) writes `process.stdout.write(...)` once per batch; with `filePath`, it appends via `fs.appendFileSync` once per batch. A sink that throws is logged via `console.error` and does not abort the drain.

### Line format

The default sink renders each entry as:

```
<ISO timestamp> [<level name>] <scope> <message>
```

For example: `2026-07-18T09:41:03.128Z [info] OrderEngine Order sent`. When a batch has `dropped > 0`, the default sink emits a `warn` marker line ahead of it: `<ISO timestamp> [warn] HfLogFlusher ring lapped - <N> entries overwritten before they could be read`.

### Ring buffer entry format

Each entry occupies exactly 256 bytes in a 64K-entry (16MB) `ArrayBuffer`, allocated lazily on the first `HfLogger.get()` call (not at module import) and shared module-wide (not per-`HfLogger` instance):

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`float64` epoch milliseconds, sub-millisecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9 | 1 byte | Scope length (0-32) |
| 10-41 | 32 bytes | Scope bytes |
| 42 | 1 byte | Message length (0-213) |
| 43-255 | 213 bytes | Message bytes |

The explicit length bytes are what make reads exact: the flusher decodes only the bytes a field actually holds, so there is no NUL padding and no stale tail from a previous, longer entry in a reused slot. The buffer wraps around at 65,536 entries using bitwise AND masking (`writeIndex & (BUFFER_SIZE - 1)`); when the producer writes faster than the flusher drains, unflushed entries are overwritten, and the overwritten count is reported via `dropped` on the next sink batch rather than silently emitted.

> [!WARNING]
> Pre-encode messages at initialization time using `HfLogger.encodeMessage()` or by calling a no-args `ILogger` method once per distinct message. Calling either with dynamic, per-event strings puts UTF-8 encoding on the hot path and can evict other cached messages once the FIFO-bounded cache (4096 entries) fills.

## Environment Variables

### Core configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_APPLICATION_NAME` | `APP` | Label prefix shown in all log output |
| `DEBUG` | `false` | Enable debug-level logging |
| `NODE_ENV` | _(unset)_ | Must be in `COMMON_ENVS` or unset for debug to activate |
| `APP_ENV_EXTRA_LOG_ENVS` | _(empty)_ | Comma-separated additional environments to allow debug |
| `APP_ENV_LOGGER_FORMAT` | `text` | Output format (`json` or `text`) |
| `APP_ENV_LOGGER_LEVEL` | `debug` | Logger-level floor; transports without their own level inherit it. Invalid values fall back to `debug` with a console warning |
| `APP_ENV_LOGGER_FOLDER_PATH` | _(unset)_ | Log files directory; file logging is OFF when unset |
| `APP_ENV_LOGGER_INSPECT_DEPTH` | `5` | Object inspection depth for `%s` placeholders. Non-negative integer only; invalid or absent falls back to `5` |
| `APP_ENV_LOGGER_DO_REDACT` | `true` | Secret redaction in log arguments. ONLY the literal `false` disables it - raw values (passwords, tokens, connection URLs) then reach the sinks. Any other value, unset included, keeps redaction ON. Never disable in production |

### File rotation

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |

### UDP transport

| Variable | Description |
|----------|-------------|
| `APP_ENV_LOGGER_DGRAM_HOST` | UDP log aggregator host |
| `APP_ENV_LOGGER_DGRAM_PORT` | UDP log aggregator port |
| `APP_ENV_LOGGER_DGRAM_LABEL` | Label to identify log source |
| `APP_ENV_LOGGER_DGRAM_LEVELS` | Comma-separated levels to send via UDP |

### Example `.env`

```bash
# Application
APP_ENV_APPLICATION_NAME=my-service

# Core
DEBUG=true
APP_ENV_LOGGER_FORMAT=json
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs
APP_ENV_LOGGER_INSPECT_DEPTH=5

# File rotation
APP_ENV_LOGGER_FILE_FREQUENCY=24h
APP_ENV_LOGGER_FILE_MAX_SIZE=500m
APP_ENV_LOGGER_FILE_MAX_FILES=30d

# UDP transport
APP_ENV_LOGGER_DGRAM_HOST=127.0.0.1
APP_ENV_LOGGER_DGRAM_PORT=5000
APP_ENV_LOGGER_DGRAM_LABEL=my-app
APP_ENV_LOGGER_DGRAM_LEVELS=error,warn,info
```

## API Summary

| Export | Kind | Description |
|--------|------|-------------|
| `ILogger` | interface | The logging contract every consumer types against - one direct method per level (`debug`, `info`, `warn`, `error`, `emerg`), plus `log` and `for` |
| `AbstractLogger` | abstract class | `ILogger` as a class - the `instanceof` check that works for EVERY provider |
| `BaseLogger` | abstract class | Provider-independent plumbing shared by every implementation: scope, prefix, the `DEBUG` gate, `.for()`, one abstract `write()` sink |
| `WinstonLogger` | class | The Winston-backed provider (the default); `Logger` is its permanent concrete alias |
| `Logger` | class | Concrete winston alias - `Logger.get(scope, customWinstonLogger?)`, `instanceof Logger`; deliberately does NOT follow `use()` |
| `PinoLogger` | class (sub-path `/pino`) | The throughput provider - register with `LoggerFactory.use` ([guide](/extensions/helpers/logger/pino)) |
| `ApplicationLogger` | const facade + type (`ILogger`) | `ApplicationLogger.get(scope)` always returns the REGISTERED provider's logger |
| `LoggerFactory` | class | Provider registration (`use({ provider })`) + `ILogger` acquisition from scope arrays |
| `ILoggerProvider` | interface | Static-side contract a provider class satisfies (`get(scope): ILogger`) |
| `HfLogger` | class | `ILogger`-conformant ring-buffer logger for hot paths |
| `HfLogFlusher` | class | Background flusher for `HfLogger` |
| `LogLevels` | class (constants) | Log level constants (`ERROR`, `EMERG`, `WARN`, `INFO`, `DEBUG`) with `isValid()` |
| `LoggerFormats` | class (constants) | Format constants (`JSON`, `TEXT`) with `isValid()` |
| `defineCustomLogger` | `(opts: ICustomLoggerOptions) => winston.Logger` | Create a fully configured Winston logger |
| `defineLogFormatter` | `(opts: { label: string; format?: TLoggerFormat }) => winston.Logform.Format` | Create a formatter (auto-detects format from env) |
| `defineJsonLoggerFormatter` | `(opts: { label: string }) => winston.Logform.Format` | Create a JSON formatter |
| `definePrettyLoggerFormatter` | `(opts: { label: string; colorize?: boolean }) => winston.Logform.Format` | Create a pretty text formatter; `colorize: false` for files/aggregators |
| `applicationLogFormatter` | `winston.Logform.Format` | Pre-built formatter using `APP_ENV_APPLICATION_NAME` label |
| `resolveLoggerLevel` | `(opts: { configured?: string }) => TLogLevel` | Validate a level string; invalid or absent falls back to `debug` |
| `resolveDefaultTransportOptions` | `() => ICustomLoggerOptions['transports']` | Default transports from `APP_ENV_LOGGER_*`, resolved at call time |
| `DgramTransport` | class | Custom Winston transport for UDP logging |
| `TLogLevel` | type | Union of all log level string literals |
| `TLoggerFormat` | type | Union of `'json' \| 'text'` |
| `IFileTransportOptions` | interface | Options for daily-rotating file transport |
| `ICustomLoggerOptions` | interface | Options for `defineCustomLogger` |
| `IDgramTransportOptions` | interface | Options for `DgramTransport` |

## Troubleshooting

### Debug logs not appearing

**Cause:** Debug logging requires both `DEBUG=true` AND a `NODE_ENV` that is either unset or present in the `COMMON_ENVS` set. These values are pre-computed at module load time.

**Fix:**
1. Verify `DEBUG=true` is set in your environment.
2. Verify `NODE_ENV` is set to one of: `local`, `debug`, `development`, `dev`, `sit`, `uat`, `alpha`, `beta`, `staging`, `production` - or is unset entirely.
3. If you use a custom environment name (e.g. `qa`), add it to `APP_ENV_EXTRA_LOG_ENVS=qa`.

```bash
DEBUG=true NODE_ENV=development bun run server:dev
```

### "[defineLogger] Invalid logger format | format: {format} | valids: json,text"

**Cause:** The `format` option passed to `defineLogFormatter` (or the `APP_ENV_LOGGER_FORMAT` environment variable) is not `json` or `text`.

**Fix:** Set `APP_ENV_LOGGER_FORMAT` to either `json` or `text`:

```bash
APP_ENV_LOGGER_FORMAT=text
```

### UDP transport not sending logs

**Cause:** `DgramTransport.fromPartial()` returns `null` if any required option is missing (`label`, `host`, `port`, `levels` with at least one entry, or `socketOptions`). The transport is silently not registered.

**Fix:**
1. Ensure **all four** dgram env vars are set: `APP_ENV_LOGGER_DGRAM_HOST`, `APP_ENV_LOGGER_DGRAM_PORT`, `APP_ENV_LOGGER_DGRAM_LABEL`, and `APP_ENV_LOGGER_DGRAM_LEVELS`.
2. `APP_ENV_LOGGER_DGRAM_LEVELS` must contain at least one level (e.g. `error,warn,info`). An empty value results in no transport.
3. Verify the UDP aggregator is reachable from your host (firewall, port binding).

### Log label shows "APP" instead of application name

**Cause:** The default label comes from `Defaults.APPLICATION_NAME`, which reads `APP_ENV_APPLICATION_NAME`. If the env var is not set, it falls back to `'APP'`.

**Fix:** Set `APP_ENV_APPLICATION_NAME` in your environment:

```bash
APP_ENV_APPLICATION_NAME=my-service
```

## See also

- [Logger overview](/extensions/helpers/logger/) - introduction and the most common tasks
- [Request Tracker Component](/extensions/components/request-tracker) - request logging
- [Winston documentation](https://github.com/winstonjs/winston) - underlying logging library
- [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file) - file rotation transport
