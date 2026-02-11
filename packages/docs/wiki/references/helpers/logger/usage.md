# Usage

## Method-Scoped Logging with `.for()`

The `.for()` method creates a sub-scoped logger for specific methods, making it easy to trace logs:

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

The `.for()` logger is also cached, so calling `logger.for('createUser')` repeatedly returns the same instance.

## Log Levels

The `LogLevels` class defines all available levels and provides validation:

```typescript
import { LogLevels } from '@venizia/ignis-helpers';
import type { TLogLevel } from '@venizia/ignis-helpers';

// Constants
LogLevels.ERROR;   // 'error'
LogLevels.ALERT;   // 'alert'
LogLevels.EMERG;   // 'emerg'
LogLevels.WARN;    // 'warn'
LogLevels.INFO;    // 'info'
LogLevels.HTTP;    // 'http'
LogLevels.VERBOSE; // 'verbose'
LogLevels.DEBUG;   // 'debug'
LogLevels.SILLY;   // 'silly'

// Validation
LogLevels.isValid('info');    // true
LogLevels.isValid('unknown'); // false

// Type - union of all level string literals
const level: TLogLevel = 'info';
```

::: details Winston level priority (numeric values)

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

:::

## Log Formats

The logger supports two output formats controlled by `APP_ENV_LOGGER_FORMAT`.

The `LoggerFormats` class provides constants and validation:

```typescript
import { LoggerFormats } from '@venizia/ignis-helpers';
import type { TLoggerFormat } from '@venizia/ignis-helpers';

LoggerFormats.JSON;              // 'json'
LoggerFormats.TEXT;              // 'text'
LoggerFormats.isValid('json');   // true

const fmt: TLoggerFormat = 'text';
```

### JSON Format

```bash
APP_ENV_LOGGER_FORMAT=json
```

Output:
```json
{"level":"info","message":"[UserService] User created","timestamp":"2024-01-11T10:30:00.000Z","label":"APP"}
```

### Pretty Text Format (Default)

```bash
APP_ENV_LOGGER_FORMAT=text
```

Output:
```
2024-01-11T10:30:00.000Z [APP] info: [UserService] User created
```

> [!NOTE]
> The label shown in log output (e.g. `APP`) comes from `APP_ENV_APPLICATION_NAME` (defaults to `'APP'`). Set this env var to customize the label for your application.

### Custom Formatters

You can build formatters directly using the exported helper functions:

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

## File Rotation Configuration

Configure file rotation through environment variables or programmatically.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period (days) |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |

### Programmatic Configuration

```typescript
import { defineCustomLogger, applicationLogFormatter } from '@venizia/ignis-helpers';

const customLogger = defineCustomLogger({
  loggerFormatter: applicationLogFormatter,
  transports: {
    info: {
      file: {
        prefix: 'my-app',
        folder: './logs',
        frequency: '24h',       // Rotate daily
        maxSize: '500m',        // 500MB max
        maxFiles: '30d',        // Keep 30 days
        datePattern: 'YYYYMMDD' // Daily pattern
      }
    },
    error: {
      file: {
        prefix: 'my-app-error',
        folder: './logs',
        maxFiles: '90d'         // Keep error logs longer
      }
    }
  }
});
```

::: details IFileTransportOptions interface

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

Generated filename pattern: `{folder}/{prefix}-info-{DATE}.log` or `{folder}/{prefix}-error-{DATE}.log`.

:::

::: details ICustomLoggerOptions interface

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

Both `info` and `error` transport groups support optional `file` (DailyRotateFile) and `dgram` (UDP) transports. A console transport is always included.

:::

## UDP Transport (DgramTransport)

The `DgramTransport` is a custom Winston transport that sends log entries over UDP, useful for centralized log aggregation.

```typescript
import { DgramTransport } from '@venizia/ignis-helpers';
import type { IDgramTransportOptions } from '@venizia/ignis-helpers';
```

::: details DgramTransport API

**Constructor:**

```typescript
const transport = new DgramTransport({
  label: 'my-app',
  host: '127.0.0.1',
  port: 5000,
  levels: ['error', 'warn', 'info'],
  socketOptions: { type: 'udp4' },
});
```

**Static factory with validation:**

```typescript
// Returns null if any required field is missing
const transport = DgramTransport.fromPartial({
  label: 'my-app',
  host: '127.0.0.1',
  port: 5000,
  levels: ['error', 'warn'],
  socketOptions: { type: 'udp4' },
});
```

**IDgramTransportOptions:**

```typescript
interface IDgramTransportOptions extends Transport.TransportStreamOptions {
  label: string;                    // Label to identify log source
  host: string;                     // UDP host
  port: number;                     // UDP port
  levels: Array<string>;            // Levels to forward over UDP
  socketOptions: dgram.SocketOptions; // Node.js dgram socket options
}
```

The transport automatically reconnects if the UDP socket encounters an error.

:::

## High-Frequency Logger (HfLogger)

For performance-critical applications like HFT systems, use `HfLogger` which provides:

- Zero allocation in hot path
- Lock-free ring buffer (64K entries)
- Sub-microsecond latency (~100-300ns)
- Pre-encoded messages
- Async background flushing

### Basic Usage

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

| Method | Description |
|--------|-------------|
| `HfLogger.get(scope)` | Get/create a cached logger instance |
| `HfLogger.encodeMessage(msg)` | Pre-encode a message string to `Uint8Array` (cached) |
| `logger.log(level, msgBytes)` | Write to ring buffer (zero allocation) |

Supported levels: `debug`, `info`, `warn`, `error`, `emerg`.

### HfLogFlusher API

| Method | Description |
|--------|-------------|
| `flusher.flush()` | Flush all buffered entries to output (async) |
| `flusher.start(intervalMs?)` | Start background flush loop (default: `100`ms) |

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Log latency | ~100-300 nanoseconds |
| Buffer size | 64K entries (16MB) |
| Entry size | 256 bytes fixed |
| Allocation | Zero in hot path |

::: details Ring buffer entry format

Each entry occupies exactly 256 bytes:

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`BigInt64`, nanosecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9-40 | 32 bytes | Scope (fixed-width, padded) |
| 41-255 | 215 bytes | Message (fixed-width, truncated if longer) |

The buffer wraps around at 65,536 entries using bitwise AND masking.

:::

## Debug Logging Behavior

Debug logs require **both** conditions to be met:

1. `DEBUG=true` environment variable is set
2. `NODE_ENV` is either unset **or** matches a known debug environment

Known debug environments include `local`, `debug`, `development`, `test`, and `staging` (from `Environment.COMMON_ENVS`). You can extend this set with `APP_ENV_EXTRA_LOG_ENVS`:

```bash
DEBUG=true
NODE_ENV=development
APP_ENV_EXTRA_LOG_ENVS=qa,preview   # Comma-separated additional environments
```

> [!WARNING]
> Setting `DEBUG=true` in production will NOT enable debug logging because `production` is not in the common environments set. This is by design to prevent accidental verbose logging in production.

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_APPLICATION_NAME` | `APP` | Label prefix shown in all log output |
| `DEBUG` | `false` | Enable debug logging |
| `NODE_ENV` | _(unset)_ | Must match a common env for debug to activate |
| `APP_ENV_EXTRA_LOG_ENVS` | _(empty)_ | Comma-separated additional environments to enable debug |
| `APP_ENV_LOGGER_FORMAT` | `text` | Output format (`json` or `text`) |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |

### File Rotation

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |

### UDP Transport

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

## Best Practices

### 1. Use Method-Scoped Logging

```typescript
// Good - clear context
this.logger.for('createOrder').info('Processing order: %s', orderId);

// Less clear
this.logger.info('[createOrder] Processing order: %s', orderId);
```

### 2. Pre-encode HfLogger Messages

```typescript
// Good - pre-encoded at init
const MSG_TICK = HfLogger.encodeMessage('Tick received');
logger.log('debug', MSG_TICK);

// Bad - encodes on every call
logger.log('debug', HfLogger.encodeMessage('Tick received'));
```

### 3. Use Appropriate Logger for Use Case

| Use Case | Logger |
|----------|--------|
| General application | `Logger` / `LoggerFactory` |
| High-frequency trading | `HfLogger` |
| Performance-critical paths | `HfLogger` |
| Debug/development | `Logger` with `DEBUG=true` |

### 4. Use LogLevels Constants Instead of Raw Strings

```typescript
import { LogLevels } from '@venizia/ignis-helpers';

// Good - type-safe and refactor-friendly
logger.log(LogLevels.ALERT, 'Critical threshold exceeded');

// Acceptable but less safe
logger.log('alert', 'Critical threshold exceeded');
```
