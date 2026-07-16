---
title: Logger - Full Reference
description: Complete reference for Logger, LoggerFactory, HfLogger, transports, formatters, and every APP_ENV_LOGGER_* environment variable
difficulty: intermediate
---

# Logger - Full Reference

Exhaustive reference for `Logger`, `LoggerFactory`, `HfLogger`/`HfLogFlusher`, the Winston formatter and transport internals, and every environment variable. For a readable introduction and the common tasks, start with the [Logger overview](/extensions/helpers/logger/).

Backed by **Winston** under the hood, with `winston-daily-rotate-file` for file rotation.

**Files:**

- [`packages/helpers/src/modules/logger/application-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/application-logger.ts) - `Logger`, `ApplicationLogger`
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory`
- [`packages/helpers/src/modules/logger/default-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/default-logger.ts) - `defineCustomLogger`, formatters, `LoggerFormats`, `applicationLogger`
- [`packages/helpers/src/modules/logger/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/types.ts) - `LogLevels`, `TLogLevel`
- [`packages/helpers/src/modules/logger/formatters/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/formatters/deep-splat.ts) - `%s` inspection widening
- [`packages/helpers/src/modules/logger/transports/dgram.transport.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/transports/dgram.transport.ts) - `DgramTransport`
- [`packages/helpers/src/modules/logger/hf-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf-logger.ts) - `HfLogger`, `HfLogFlusher`

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| `Logger` | - | General-purpose scoped logger with caching |
| `LoggerFactory` | - | Factory that builds `Logger` instances from scope arrays |
| `HfLogger` | - | Zero-allocation ring-buffer logger for hot paths (~100-300ns) |
| `HfLogFlusher` | - | Background flusher for `HfLogger` entries |
| `DgramTransport` | `winston-transport.Transport` | Custom Winston transport that sends logs over UDP |

### Import paths

```typescript
// Core classes
import { Logger, LoggerFactory, ApplicationLogger } from '@venizia/ignis-helpers';

// High-frequency logger
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// Constants & types
import { LogLevels, LoggerFormats } from '@venizia/ignis-helpers';
import type { TLogLevel, TLoggerFormat } from '@venizia/ignis-helpers';

// Custom logger utilities
import {
  defineCustomLogger,
  defineLogFormatter,
  defineJsonLoggerFormatter,
  definePrettyLoggerFormatter,
  applicationLogFormatter,
  applicationLogger,
} from '@venizia/ignis-helpers';
import type { IFileTransportOptions, ICustomLoggerOptions } from '@venizia/ignis-helpers';

// UDP transport
import { DgramTransport } from '@venizia/ignis-helpers';
import type { IDgramTransportOptions } from '@venizia/ignis-helpers';
```

All of the above resolve through the root `@venizia/ignis-helpers` barrel, which re-exports `./modules` (and therefore `./modules/logger`) in full.

## Creating an Instance

`Source ->` [`application-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/application-logger.ts), [`factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts)

### Using LoggerFactory (recommended)

`LoggerFactory.getLogger` accepts an array of scope strings, joins them with `-`, and returns a cached `Logger` instance via `Logger.get`.

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
import { Logger } from '@venizia/ignis-helpers';

const logger = Logger.get('MyService');
logger.info('Direct logger access');
// Output: [MyService] Direct logger access
```

Pass a custom Winston logger instance as the second parameter to use your own transport configuration:

```typescript
import { Logger, defineCustomLogger, applicationLogFormatter } from '@venizia/ignis-helpers';

const customWinstonLogger = defineCustomLogger({
  loggerFormatter: applicationLogFormatter,
  transports: {
    info: { file: { prefix: 'custom', folder: './logs' } },
    error: { file: { prefix: 'custom-error', folder: './logs' } },
  },
});

const logger = Logger.get('MyService', customWinstonLogger);
```

Custom loggers are cached under a separate key (`scope:custom`), so a default and a custom logger for the same scope coexist without colliding.

### Logger caching

Both `Logger.get` and `LoggerFactory.getLogger` cache internally - the same scope always returns the same `Logger` instance:

```typescript
const logger1 = Logger.get('MyService');
const logger2 = Logger.get('MyService');
// logger1 === logger2 (same instance)
```

### ApplicationLogger alias

`ApplicationLogger` is exported as both a value and a type alias for `Logger`, for code written before the class was named `Logger`.

```typescript
import { ApplicationLogger } from '@venizia/ignis-helpers';

const logger = ApplicationLogger.get('MyService');
```

## Log Levels

`Source ->` [`types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/types.ts), [`application-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/application-logger.ts)

`Logger` exposes direct methods for `info`, `warn`, `error`, `emerg`, and `debug`. Other levels (`alert`, `http`, `verbose`, `silly`) go through the generic `log()` method.

```typescript
logger.info('User created');
logger.warn('Rate limit approaching');
logger.error('Failed to process payment');
logger.emerg('System out of memory');
logger.debug('Query took 12ms');            // Requires DEBUG=true
logger.log('alert', 'Threshold exceeded');  // Generic method for any level
```

`LogLevels` defines all available levels and provides validation:

```typescript
import { LogLevels } from '@venizia/ignis-helpers';
import type { TLogLevel } from '@venizia/ignis-helpers';

LogLevels.ERROR;   // 'error'
LogLevels.ALERT;   // 'alert'
LogLevels.EMERG;   // 'emerg'
LogLevels.WARN;    // 'warn'
LogLevels.INFO;    // 'info'
LogLevels.HTTP;    // 'http'
LogLevels.VERBOSE; // 'verbose'
LogLevels.DEBUG;   // 'debug'
LogLevels.SILLY;   // 'silly'

LogLevels.isValid('info');    // true
LogLevels.isValid('unknown'); // false

const level: TLogLevel = 'info';
```

### Winston level priority

`defineCustomLogger` configures Winston with these numeric priorities by default:

| Level | Priority | Color |
|-------|----------|-------|
| `error` | 0 | red |
| `alert` | 0 | red |
| `emerg` | 0 | red |
| `warn` | 1 | yellow |
| `info` | 2 | green |
| `http` | 3 | magenta |
| `verbose` | 4 | gray |
| `debug` | 5 | blue |
| `silly` | 6 | gray |

Lower numeric values have higher priority. `error`, `alert`, and `emerg` share priority `0`.

## Method-Scoped Logging

`.for()` creates a sub-scoped logger for a specific method, appending the method name to the scope with a `-` separator. The result is also cached.

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

`Source ->` [`formatters/deep-splat.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/formatters/deep-splat.ts)

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
```

`defineLogFormatter` throws an `ApplicationError` if `format` (or `APP_ENV_LOGGER_FORMAT`) is not `'json'` or `'text'`.

## Transports

`Source ->` [`default-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/default-logger.ts)

Every logger created by `defineCustomLogger` always includes a **Console** transport at the `debug` level. File and UDP transports are optional and are registered per transport group (`info`, `error`).

### File rotation (DailyRotateFile)

Configure file rotation through environment variables or programmatically via `IFileTransportOptions`.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |

**Programmatic configuration:**

```typescript
import { defineCustomLogger, applicationLogFormatter } from '@venizia/ignis-helpers';

const customLogger = defineCustomLogger({
  loggerFormatter: applicationLogFormatter,
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

`Source ->` [`transports/dgram.transport.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/transports/dgram.transport.ts)

`DgramTransport` is a custom Winston transport that sends log entries over UDP. It filters by level - only messages whose level is in the configured `levels` set are forwarded.

```typescript
import { DgramTransport } from '@venizia/ignis-helpers';

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

On a socket error the transport closes and nulls its client; the next `log()` call re-establishes the socket before sending.

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
  logLevels?: { [name: string | symbol]: number };
  logColors?: { [name: string | symbol]: string };
  loggerFormatter?: ReturnType<typeof winston.format.combine>;
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

`Source ->` [`application-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/application-logger.ts)

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

`Source ->` [`hf-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf-logger.ts)

For performance-critical applications (e.g. HFT systems, game servers), `HfLogger` provides zero-allocation logging via a lock-free ring buffer backed by `SharedArrayBuffer`. It is entirely separate from the Winston-backed `Logger` - no formatters, transports, or env vars apply to it.

```typescript
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// At initialization time (once):
const logger = HfLogger.get('OrderEngine');
const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');
const MSG_ORDER_FILLED = HfLogger.encodeMessage('Order filled');

// Start background flusher
const flusher = new HfLogFlusher();
flusher.start(100); // Flush every 100ms

// In hot path (~100-300ns, zero allocation):
logger.log('info', MSG_ORDER_SENT);
logger.log('info', MSG_ORDER_FILLED);
```

### HfLogger API

| Method | Signature | Description |
|--------|-----------|--------------|
| `HfLogger.get` | `(scope: string) => HfLogger` | Get or create a cached logger instance |
| `HfLogger.encodeMessage` | `(msg: string) => Uint8Array` | Pre-encode a message string to bytes (cached) |
| `logger.log` | `(level: THfLogLevel, messageBytes: Uint8Array) => void` | Write entry to the ring buffer |

Supported levels: `debug` (0), `info` (1), `warn` (2), `error` (3), `emerg` (4).

### HfLogFlusher API

| Method | Signature | Description |
|--------|-----------|--------------|
| `flusher.flush` | `() => Promise<void>` | Drain all buffered entries not yet flushed, writing each to `console.log` |
| `flusher.start` | `(intervalMs?: number) => void` | Start a background `setInterval` flush loop (default: `100`ms) |

### Ring buffer entry format

Each entry occupies exactly 256 bytes in a 64K-entry (16MB) `SharedArrayBuffer` shared module-wide (not per-`HfLogger` instance):

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`BigInt64`, nanosecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9-40 | 32 bytes | Scope (fixed-width, padded) |
| 41-255 | 215 bytes | Message (fixed-width, truncated if longer) |

The buffer wraps around at 65,536 entries using bitwise AND masking (`writeIndex & (BUFFER_SIZE - 1)`), so unflushed entries older than 65,536 writes are silently overwritten.

> [!WARNING]
> Pre-encode messages at initialization time using `HfLogger.encodeMessage()`. Calling it in the hot path defeats the zero-allocation purpose because it triggers string encoding on every log call.

## Environment Variables

### Core configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_APPLICATION_NAME` | `APP` | Label prefix shown in all log output |
| `DEBUG` | `false` | Enable debug-level logging |
| `NODE_ENV` | _(unset)_ | Must be in `COMMON_ENVS` or unset for debug to activate |
| `APP_ENV_EXTRA_LOG_ENVS` | _(empty)_ | Comma-separated additional environments to allow debug |
| `APP_ENV_LOGGER_FORMAT` | `text` | Output format (`json` or `text`) |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |
| `APP_ENV_LOGGER_INSPECT_DEPTH` | `5` | Object inspection depth for `%s` placeholders. Non-negative integer only; invalid or absent falls back to `5` |

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
| `Logger` | class | Scoped logger with caching, wraps a Winston logger instance |
| `ApplicationLogger` | value + type alias | Backward-compatible alias for `Logger` |
| `LoggerFactory` | class | Factory that creates `Logger` from scope arrays |
| `HfLogger` | class | Zero-allocation ring-buffer logger |
| `HfLogFlusher` | class | Background flusher for `HfLogger` |
| `LogLevels` | class (constants) | Log level constants (`ERROR`, `ALERT`, `EMERG`, `WARN`, `INFO`, `HTTP`, `VERBOSE`, `DEBUG`, `SILLY`) with `isValid()` |
| `LoggerFormats` | class (constants) | Format constants (`JSON`, `TEXT`) with `isValid()` |
| `defineCustomLogger` | `(opts: ICustomLoggerOptions) => winston.Logger` | Create a fully configured Winston logger |
| `defineLogFormatter` | `(opts: { label: string; format?: TLoggerFormat }) => winston.Logform.Format` | Create a formatter (auto-detects format from env) |
| `defineJsonLoggerFormatter` | `(opts: { label: string }) => winston.Logform.Format` | Create a JSON formatter |
| `definePrettyLoggerFormatter` | `(opts: { label: string }) => winston.Logform.Format` | Create a pretty text formatter |
| `applicationLogFormatter` | `winston.Logform.Format` | Pre-built formatter using `APP_ENV_APPLICATION_NAME` label |
| `applicationLogger` | `winston.Logger` | Pre-built default Winston logger instance |
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
