# Quick Reference

| Feature | Description |
|---------|-------------|
| **Factory Method** | `LoggerFactory.getLogger(['scope1', 'scope2'])` |
| **Direct Access** | `Logger.get('scope')` |
| **Custom Logger** | `Logger.get('scope', winstonLogger)` |
| **Method Scoping** | `logger.for('methodName').info('message')` |
| **Log Levels** | `error`, `alert`, `emerg`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` |
| **Transports** | Console (default), DailyRotateFile, UDP/Dgram |
| **Formats** | JSON (`json`), Pretty Text (`text`) |
| **HF Logger** | Zero-allocation logging for HFT use cases |

## Common Methods

```typescript
logger.info('message');                    // Informational
logger.error('message');                   // Error
logger.warn('message');                    // Warning
logger.emerg('message');                   // Emergency
logger.debug('message');                   // Debug (requires DEBUG=true)
logger.log('alert', 'message');            // Generic (any TLogLevel)
logger.for('methodName').info('message');  // Method-scoped logging
```

> [!NOTE]
> The `Logger` class exposes direct methods for `info`, `warn`, `error`, `emerg`, and `debug`. Other levels such as `alert`, `http`, `verbose`, and `silly` are accessible through the generic `logger.log(level, message)` method.

::: details Import Paths
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
:::

::: details Exported API Summary

| Export | Kind | Source File |
|--------|------|-------------|
| `Logger` | class | `application-logger.ts` |
| `ApplicationLogger` | value + type alias for `Logger` | `application-logger.ts` |
| `LoggerFactory` | class | `factory.ts` |
| `HfLogger` | class | `hf-logger.ts` |
| `HfLogFlusher` | class | `hf-logger.ts` |
| `LogLevels` | class (constants) | `types.ts` |
| `TLogLevel` | type | `types.ts` |
| `LoggerFormats` | class (constants) | `default-logger.ts` |
| `TLoggerFormat` | type | `default-logger.ts` |
| `defineCustomLogger` | function | `default-logger.ts` |
| `defineLogFormatter` | function | `default-logger.ts` |
| `defineJsonLoggerFormatter` | function | `default-logger.ts` |
| `definePrettyLoggerFormatter` | function | `default-logger.ts` |
| `applicationLogFormatter` | `winston.Logform.Format` instance | `default-logger.ts` |
| `applicationLogger` | `winston.Logger` instance | `default-logger.ts` |
| `IFileTransportOptions` | interface | `default-logger.ts` |
| `ICustomLoggerOptions` | interface | `default-logger.ts` |
| `DgramTransport` | class | `transports/dgram.transport.ts` |
| `IDgramTransportOptions` | interface | `transports/dgram.transport.ts` |

:::
