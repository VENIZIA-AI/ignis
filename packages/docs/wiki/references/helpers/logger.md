# Logger Helper

Powerful, flexible logging built on Winston - supports multiple transports, log levels, hierarchical scopes, and high-frequency logging for performance-critical applications.

## Quick Reference

| Feature | Description |
|---------|-------------|
| **Factory Method** | `LoggerFactory.getLogger(['scope1', 'scope2'])` |
| **Direct Access** | `Logger.get('scope')` |
| **Method Scoping** | `logger.for('methodName').info('message')` |
| **Log Levels** | `error`, `alert`, `emerg`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |
| **Transports** | Console (default), DailyRotateFile, UDP/Dgram |
| **Formats** | JSON (`json`), Pretty Text (`text`) |
| **HF Logger** | Zero-allocation logging for HFT use cases |

### Common Methods

```typescript
logger.info('message');                    // Informational
logger.error('message');                   // Error
logger.warn('message');                    // Warning
logger.debug('message');                   // Debug (requires DEBUG=true)
logger.for('methodName').info('message');  // Method-scoped logging
```

## Getting a Logger Instance

### Using LoggerFactory (Recommended)

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['MyService']);

logger.info('This is an informational message.');
logger.error('This is an error message.');
```

### Using Logger.get() Directly

```typescript
import { Logger } from '@venizia/ignis-helpers';

const logger = Logger.get('MyService');
logger.info('Direct logger access');
```

### Logger Caching

Both methods use internal caching - the same scope always returns the same logger instance:

```typescript
const logger1 = Logger.get('MyService');
const logger2 = Logger.get('MyService');
// logger1 === logger2 (same instance)
```

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

## Log Formats

The logger supports two output formats controlled by `APP_ENV_LOGGER_FORMAT`:

### JSON Format

```bash
APP_ENV_LOGGER_FORMAT=json
```

Output:
```json
{"level":"info","message":"[UserService] User created","timestamp":"2024-01-11T10:30:00.000Z","label":"app"}
```

### Pretty Text Format (Default)

```bash
APP_ENV_LOGGER_FORMAT=text
```

Output:
```
2024-01-11T10:30:00.000Z [app] info: [UserService] User created
```

## File Rotation Configuration

Configure file rotation through environment variables or programmatically:

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
| `HfLogger.encodeMessage(msg)` | Pre-encode a message (cached) |
| `logger.log(level, msgBytes)` | Log to ring buffer (zero allocation) |

### HfLogFlusher API

| Method | Description |
|--------|-------------|
| `flusher.flush()` | Flush buffered entries to output |
| `flusher.start(intervalMs)` | Start background flush loop |

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Log latency | ~100-300 nanoseconds |
| Buffer size | 64K entries (16MB) |
| Entry size | 256 bytes fixed |
| Allocation | Zero in hot path |

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Enable debug logging |
| `APP_ENV_EXTRA_LOG_ENVS` | `` | Additional environments to enable debug |
| `APP_ENV_LOGGER_FORMAT` | `text` | Output format (`json` or `text`) |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./` | Log files directory |

### UDP Transport

| Variable | Description |
|----------|-------------|
| `APP_ENV_LOGGER_DGRAM_HOST` | UDP log aggregator host |
| `APP_ENV_LOGGER_DGRAM_PORT` | UDP log aggregator port |
| `APP_ENV_LOGGER_DGRAM_LABEL` | Label to identify log source |
| `APP_ENV_LOGGER_DGRAM_LEVELS` | Comma-separated levels to send via UDP |

### Example `.env`

```bash
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

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Logging in services
  - [Controllers](/guides/core-concepts/controllers) - Logging in controllers

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Error Helper](./error) - Error handling utilities

- **References:**
  - [Request Tracker Component](/references/components/request-tracker) - Request logging
  - [Environment Variables](/references/configuration/environment-variables) - All configuration options

- **External Resources:**
  - [Winston Documentation](https://github.com/winstonjs/winston) - Winston logging library

- **Best Practices:**
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips) - Using logs for debugging
  - [Performance Optimization](/best-practices/performance-optimization) - High-performance logging
