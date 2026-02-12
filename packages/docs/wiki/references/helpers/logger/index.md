# Logger

Winston-based logging with scoped prefixes, multiple transports (console, daily-rotating files, UDP), and a zero-allocation high-frequency logger for performance-critical paths.

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| `Logger` | -- | General-purpose scoped logger with caching |
| `LoggerFactory` | -- | Factory that builds `Logger` instances from scope arrays |
| `HfLogger` | -- | Zero-allocation ring-buffer logger for hot paths (~100-300ns) |
| `HfLogFlusher` | -- | Background flusher for `HfLogger` entries |
| `DgramTransport` | `winston-transport.Transport` | Custom Winston transport that sends logs over UDP |

#### Import Paths

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

## Creating an Instance

### Using LoggerFactory (Recommended)

`LoggerFactory.getLogger` accepts an array of scope strings, joins them with `-`, and returns a cached `Logger` instance.

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['MyService']);
logger.info('Service initialized');
// Output: [MyService] Service initialized

const scopedLogger = LoggerFactory.getLogger(['Payment', 'Stripe']);
scopedLogger.info('Charge created');
// Output: [Payment-Stripe] Charge created
```

> [!TIP]
> `LoggerFactory` is how `BaseHelper` creates its internal logger. Every helper in the framework gets a scoped logger automatically through this path.

### Using Logger.get() Directly

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

Custom loggers are cached under a separate key (`scope:custom`), so a default and custom logger for the same scope can coexist.

### Logger Caching

Both methods use internal caching -- the same scope always returns the same `Logger` instance:

```typescript
const logger1 = Logger.get('MyService');
const logger2 = Logger.get('MyService');
// logger1 === logger2 (same instance)
```

### ApplicationLogger Alias

`ApplicationLogger` is exported as both a value and a type alias for `Logger`, providing backward compatibility:

```typescript
import { ApplicationLogger } from '@venizia/ignis-helpers';

const logger = ApplicationLogger.get('MyService');
```

## Usage

### Log Levels

The `Logger` class exposes direct methods for `info`, `warn`, `error`, `emerg`, and `debug`. Other levels (`alert`, `http`, `verbose`, `silly`) are accessible through the generic `log()` method.

```typescript
logger.info('User created');
logger.warn('Rate limit approaching');
logger.error('Failed to process payment');
logger.emerg('System out of memory');
logger.debug('Query took 12ms');            // Requires DEBUG=true
logger.log('alert', 'Threshold exceeded');  // Generic method for any level
```

The `LogLevels` class defines all available levels and provides validation:

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

#### Winston Level Priority

The `defineCustomLogger` function configures Winston with these numeric priorities by default:

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

### Method-Scoped Logging

The `.for()` method creates a sub-scoped logger for specific methods, appending the method name to the scope with a `-` separator. The resulting logger is also cached.

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

### Log Formats

The logger supports two output formats, controlled by the `APP_ENV_LOGGER_FORMAT` environment variable (default: `text`).

The `LoggerFormats` class provides constants and validation:

```typescript
import { LoggerFormats } from '@venizia/ignis-helpers';
import type { TLoggerFormat } from '@venizia/ignis-helpers';

LoggerFormats.JSON;              // 'json'
LoggerFormats.TEXT;              // 'text'
LoggerFormats.isValid('json');   // true

const fmt: TLoggerFormat = 'text';
```

#### JSON Format

```bash
APP_ENV_LOGGER_FORMAT=json
```

Output:

```json
{"level":"info","message":"[UserService] User created","timestamp":"2024-01-11T10:30:00.000Z","label":"APP"}
```

#### Pretty Text Format (Default)

```bash
APP_ENV_LOGGER_FORMAT=text
```

Output:

```
2024-01-11T10:30:00.000Z [APP] info: [UserService] User created
```

> [!NOTE]
> The label shown in log output (e.g. `APP`) comes from `APP_ENV_APPLICATION_NAME` (defaults to `'APP'`). Set this env var to customize the label for your application.

#### Custom Formatters

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

### Transports

Every logger created by `defineCustomLogger` always includes a **Console** transport at the `debug` level. File and UDP transports are optional.

#### File Rotation (DailyRotateFile)

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

Generated filename pattern: `{folder}/{prefix}-info-{DATE}.log` or `{folder}/{prefix}-error-{DATE}.log`.

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

#### UDP Transport (DgramTransport)

The `DgramTransport` is a custom Winston transport that sends log entries over UDP. It supports level-based filtering -- only messages matching the configured `levels` set are forwarded.

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

**Static factory with validation** -- returns `null` if any required field is missing:

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

The transport automatically re-establishes the UDP socket if it encounters an error.

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

#### ICustomLoggerOptions

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

Both `info` and `error` transport groups support optional `file` (DailyRotateFile) and `dgram` (UDP) transports. A console transport is always included. Error file transports are also registered as exception handlers.

### Debug Logging Behavior

Debug logs require **both** conditions to be met:

1. `DEBUG=true` environment variable is set (parsed via `toBoolean`)
2. `NODE_ENV` is either unset **or** is present in the `Environment.COMMON_ENVS` set

The `COMMON_ENVS` set includes: `local`, `debug`, `development`, `alpha`, `beta`, `staging`, `production`. You can extend this set with `APP_ENV_EXTRA_LOG_ENVS`:

```bash
DEBUG=true
NODE_ENV=development
APP_ENV_EXTRA_LOG_ENVS=qa,preview   # Comma-separated additional environments
```

> [!IMPORTANT]
> The debug flag check is pre-computed at module load time. Changing `DEBUG` or `NODE_ENV` at runtime has no effect -- the values are captured once when the module is first imported.

### High-Frequency Logger (HfLogger)

For performance-critical applications (e.g., HFT systems, game servers), `HfLogger` provides zero-allocation logging via a lock-free ring buffer backed by `SharedArrayBuffer`.

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

#### HfLogger API

| Method | Signature | Description |
|--------|-----------|-------------|
| `HfLogger.get` | `(scope: string) => HfLogger` | Get or create a cached logger instance |
| `HfLogger.encodeMessage` | `(msg: string) => Uint8Array` | Pre-encode a message string to bytes (cached) |
| `logger.log` | `(level: THfLogLevel, messageBytes: Uint8Array) => void` | Write entry to ring buffer |

Supported levels: `debug` (0), `info` (1), `warn` (2), `error` (3), `emerg` (4).

#### HfLogFlusher API

| Method | Signature | Description |
|--------|-----------|-------------|
| `flusher.flush` | `() => Promise<void>` | Flush all buffered entries to output |
| `flusher.start` | `(intervalMs?: number) => void` | Start background flush loop (default: `100`ms) |

#### Ring Buffer Entry Format

Each entry occupies exactly 256 bytes in a 64K-entry (16MB) `SharedArrayBuffer`:

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`BigInt64`, nanosecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9-40 | 32 bytes | Scope (fixed-width, padded) |
| 41-255 | 215 bytes | Message (fixed-width, truncated if longer) |

The buffer wraps around at 65,536 entries using bitwise AND masking (`writeIndex & (BUFFER_SIZE - 1)`).

> [!WARNING]
> Pre-encode messages at initialization time using `HfLogger.encodeMessage()`. Calling it in the hot path defeats the zero-allocation purpose because it triggers string encoding on every log call.

### Environment Variables

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_APPLICATION_NAME` | `APP` | Label prefix shown in all log output |
| `DEBUG` | `false` | Enable debug-level logging |
| `NODE_ENV` | _(unset)_ | Must be in `COMMON_ENVS` or unset for debug to activate |
| `APP_ENV_EXTRA_LOG_ENVS` | _(empty)_ | Comma-separated additional environments to allow debug |
| `APP_ENV_LOGGER_FORMAT` | `text` | Output format (`json` or `text`) |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |

#### File Rotation

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |

#### UDP Transport

| Variable | Description |
|----------|-------------|
| `APP_ENV_LOGGER_DGRAM_HOST` | UDP log aggregator host |
| `APP_ENV_LOGGER_DGRAM_PORT` | UDP log aggregator port |
| `APP_ENV_LOGGER_DGRAM_LABEL` | Label to identify log source |
| `APP_ENV_LOGGER_DGRAM_LEVELS` | Comma-separated levels to send via UDP |

#### Example `.env`

```bash
# Application
APP_ENV_APPLICATION_NAME=my-service

# Core
DEBUG=true
APP_ENV_LOGGER_FORMAT=json
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs

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
2. Verify `NODE_ENV` is set to one of: `local`, `debug`, `development`, `alpha`, `beta`, `staging`, `production` -- or is unset entirely.
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

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) -- Logging in services
  - [Controllers](/guides/core-concepts/controllers) -- Logging in controllers

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers

- **References:**
  - [Request Tracker Component](/references/components/request-tracker) -- Request logging

- **External Resources:**
  - [Winston Documentation](https://github.com/winstonjs/winston) -- Winston logging library
  - [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file) -- File rotation transport
