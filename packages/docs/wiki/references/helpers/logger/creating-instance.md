# Creating an Instance

## Using LoggerFactory (Recommended)

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['MyService']);

logger.info('This is an informational message.');
logger.error('This is an error message.');
```

`LoggerFactory.getLogger` accepts an array of scopes and joins them with `-`:

```typescript
const logger = LoggerFactory.getLogger(['Payment', 'Stripe']);
logger.info('Charge created');
// Output: [Payment-Stripe] Charge created
```

## Using Logger.get() Directly

```typescript
import { Logger } from '@venizia/ignis-helpers';

const logger = Logger.get('MyService');
logger.info('Direct logger access');
```

You can also pass a custom Winston logger instance as the second parameter:

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

> [!TIP]
> Custom loggers are cached under a separate key (`scope:custom`), so a default and custom logger for the same scope can coexist.

## Logger Caching

Both methods use internal caching -- the same scope always returns the same logger instance:

```typescript
const logger1 = Logger.get('MyService');
const logger2 = Logger.get('MyService');
// logger1 === logger2 (same instance)
```

## ApplicationLogger Alias

`ApplicationLogger` is exported as both a value and a type alias for `Logger`, providing backward compatibility:

```typescript
import { ApplicationLogger } from '@venizia/ignis-helpers';

const logger = ApplicationLogger.get('MyService');
```
