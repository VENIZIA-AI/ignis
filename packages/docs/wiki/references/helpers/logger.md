# Logger Helper

Powerful, flexible logging built on Winston - supports multiple transports, log levels, and hierarchical scopes.

## Quick Reference

| Feature | Description |
|---------|-------------|
| **Factory Method** | `LoggerFactory.getLogger(['scope1', 'scope2'])` |
| **Log Levels** | `error`, `alert`, `emerg`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |
| **Transports** | Console (default), DailyRotateFile, UDP/Dgram |
| **Scopes** | Hierarchical context tracking (e.g., `['MyService', 'MyMethod']`) |

### Common Methods

```typescript
logger.info('message');      // Informational
logger.error('message');     // Error
logger.warn('message');      // Warning
logger.debug('message');     // Debug
```

## Getting a Logger Instance

The recommended way to get a logger instance is by using the `LoggerFactory`.

```typescript
import { LoggerFactory } from '@vez/ignis';

const logger = LoggerFactory.getLogger(['MyService']);

logger.info('This is an informational message.');
logger.error('This is an error message.');
```

### Scopes

You can provide an array of scopes to the `getLogger` method to create a hierarchical logger. This is useful for identifying the source of log messages.

```typescript
const logger = LoggerFactory.getLogger(['MyService', 'MyMethod']);
logger.info('This message is from MyService-MyMethod');
```

## Configuration

The logger is configured through environment variables and the `defineCustomLogger` function, which sets up the `winston` instance.

### Log Levels

The logger supports the following log levels (from highest to lowest priority): `error`, `alert`, `emerg`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`.

### Transports

`Ignis` comes with three main types of transports:

1.  **Console:** Logs messages to the console. Enabled by default.
2.  **DailyRotateFile:** Logs messages to files that are rotated on a daily or hourly basis.
3.  **Dgram (UDP):** Sends log messages over UDP to a remote log aggregation service.

### Environment Variables for Configuration

-   `APP_ENV_LOGGER_FOLDER_PATH`: The directory to store log files.
-   `APP_ENV_APPLICATION_NAME`: Used as a prefix for log files and as a label in log messages.
-   `APP_ENV_LOGGER_DGRAM_HOST`: The host for the UDP log transport.
-   `APP_ENV_LOGGER_DGRAM_PORT`: The port for the UDP log transport.
-   `APP_ENV_LOGGER_DGRAM_LABEL`: A label to identify the source of UDP logs.
-   `APP_ENV_LOGGER_DGRAM_LEVELS`: A comma-separated list of log levels to be sent via UDP (e.g., `error,warn,info`).

**Example `.env` file:**

```
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs
APP_ENV_LOGGER_DGRAM_HOST=127.0.0.1
APP_ENV_LOGGER_DGRAM_PORT=5000
APP_ENV_LOGGER_DGRAM_LABEL=my-app
APP_ENV_LOGGER_DGRAM_LEVELS=error,warn,info,debug
```

## Custom Logger

While the default logger is powerful, you can create your own custom logger by extending the `Logger` class and providing a custom `winston.Logger` instance.

```typescript
import { Logger, defineCustomLogger, applicationLogFormatter } from '@vez/ignis';
import winston from 'winston';

const myCustomWinstonLogger = defineCustomLogger({
  loggerFormatter: applicationLogFormatter,
  transports: {
    info: { file: { prefix: 'my-app', folder: './logs' } },
    error: { file: { prefix: 'my-app-error', folder: './logs' } },
  },
});

const myLogger = new Logger({ customLogger: myCustomWinstonLogger });
myLogger.withScope('CustomScope').info('This is a custom log message.');
```
