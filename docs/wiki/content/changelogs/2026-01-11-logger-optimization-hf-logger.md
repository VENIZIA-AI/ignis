---
title: Logger Optimization & HfLogger
description: The Logger is faster, gains method-scoped logging and configurable file rotation and format, and a new HfLogger serves performance-critical code.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-01-11

## Logger Optimization & High-Frequency Logger

**In one line.** Logging is faster, you can scope logs to a method with `.for()`, and `HfLogger` gives a near zero-cost logger for hot paths.

## What changed

- **Faster `Logger`.** Cached instances, a precomputed prefix and direct Winston calls.
- **`.for()` method.** `this.logger.for('createUser').info('Creating user: %j', data)` prints `[UserService-createUser] Creating user: {...}`.
- **`HfLogger`.** A zero-allocation logger on a SharedArrayBuffer ring buffer, about 100-300 nanoseconds per call. Pre-encode messages once, start an `HfLogFlusher`, then call `logger.log(level, message)`.
- **File rotation settings.** Set by environment variables or `defineCustomLogger`.
- **Output format.** `APP_ENV_LOGGER_FORMAT` is `json` (for log aggregators) or `text` (default, for development).

```typescript
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

const logger = HfLogger.get('OrderEngine');
const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');

const flusher = new HfLogFlusher();
flusher.start(100); // Flush every 100ms

logger.log('info', MSG_ORDER_SENT); // hot path
```

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `1h` | Rotation frequency |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | `100m` | Max file size before rotation |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | `5d` | Retention period (days) |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | `YYYYMMDD_HH` | Date pattern in filename |
| `APP_ENV_LOGGER_FORMAT` | `text` | `json` or `text` |

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
        datePattern: 'YYYYMMDD'
      }
    }
  }
});
```

## Who is affected

- **Everyone.** No action needed. `ApplicationLogger` is still exported as a type alias for `Logger`, `LoggerFactory.getLogger()` still works, and the environment variables have defaults.

## Details

- Pre-encode `HfLogger` messages once at startup. Encoding inside the hot path allocates on every call.
