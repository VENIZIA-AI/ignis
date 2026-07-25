---
title: Logger
description: Scoped, cached logging via LoggerFactory - Winston by default, with console, daily-rotating file, and UDP transports built in
difficulty: beginner
---

# Logger

IGNIS gives every helper a scoped `ILogger`. `LoggerFactory` builds it from one registered provider - Winston by default, with console, daily-rotating file, and UDP transports built in.

## In one example

The smallest real use: get a scoped logger and log with it.

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['UserService']);
logger.info('User created');
// Output: [UserService] User created
```

`LoggerFactory` is how `BaseHelper` creates its internal logger, so every helper in the framework gets a scoped logger the same way, for free.

## How it works

- **Typed against `ILogger`.** Every consumer - including `BaseHelper.logger` - gets the `ILogger` interface, never a concrete class. Winston is the default provider behind it, selected in `factory.ts`.
- **Provider-based.** `LoggerFactory.use({ provider })` selects the app's logger engine once, at the entrypoint. Winston is the default; [pino](/extensions/helpers/logger/pino) is the throughput option. Every factory-issued logger follows the registration, even one captured at import time.
- **Scoped and cached.** `LoggerFactory.getLogger(scopes)` joins the scopes with `-` and caches the result per scope. The same scope always returns the same instance. `BaseHelper` calls this in its constructor, so every helper's `this.logger` comes pre-scoped.
- **Custom-backed loggers are the exception.** `Logger.get(scope, customWinstonLogger)` (from the `/winston` sub-path) is NOT cached. Each call returns a fresh wrapper over the instance you passed in.
- **Method scoping.** `.for(methodName)` returns a child logger scoped to `<scope>-<methodName>` (also cached), so each line shows where it came from.
- **Level floor.** `APP_ENV_LOGGER_LEVEL` (default `debug`) sets the logger-level floor. Transports without their own level inherit it.
- **`debug()` is gated.** It emits only when `DEBUG=true` and `NODE_ENV` is unset or listed in `Environment.COMMON_ENVS`. Extend that set via `APP_ENV_EXTRA_LOG_ENVS`. The check runs once at module load - runtime env changes need a restart.

**Log levels**

Five levels, each with a direct method: `debug`, `info`, `warn`, `error`, `emerg`. The generic `.log(level, ...)` remains for picking the level dynamically. What each level means, and when to use it, is in the [level guide](/extensions/helpers/logger/reference#what-each-level-means).

**Transports**

| Transport | Turns on when |
|-----------|---------------|
| Console | Always |
| Daily-rotating file | `APP_ENV_LOGGER_FOLDER_PATH` is set |
| UDP (`DgramTransport`) | All four UDP `APP_ENV_LOGGER_DGRAM_*` variables are set |

Output shape (plain text or JSON) follows `APP_ENV_LOGGER_FORMAT`. Color codes appear only on the console - file and UDP output never carries ANSI escapes.

For extreme hot paths, `HfLogger` is a separate ring-buffer logger outside this pipeline, with its own [usage guide](/extensions/helpers/logger/hf-logger). The [Full reference](/extensions/helpers/logger/reference) covers everything else, including the `ApplicationLogger` facade.

## Common tasks

### Get a scoped logger

Use `LoggerFactory.getLogger` with an array of scope segments, or `ApplicationLogger.get` with a single string. Both cache by scope and follow the registered provider.

```typescript
import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';

const scoped = LoggerFactory.getLogger(['Payment', 'Stripe']); // [Payment-Stripe]
const direct = ApplicationLogger.get('MyService');             // [MyService]
```

### Scope logs to a method

`.for()` appends a method name to the current scope so every line in that method self-identifies.

```typescript
class UserService {
  private logger = LoggerFactory.getLogger(['UserService']);

  async createUser(data: CreateUserDto) {
    this.logger.for('createUser').info('Creating user: %j', data);
    // Output: [UserService-createUser] Creating user: {...}
  }
}
```

### Log an Error with `%s`, never `%j`

`message` and `stack` are non-enumerable on a native `Error`. `%j` formats via `JSON.stringify`, which only visits enumerable own properties. So it silently drops both. Always pair an `Error` argument with `%s`.

```typescript
logger.error('Failed to create user: %s', error); // prints message + stack
```

### Keep a driver error readable with `ErrorPrettier`

`%s` prints the whole object. A `pg` or `drizzle` failure carries the statement in `message`, again in `stack`, and again in `query` - one failure floods the log with the same SQL several times. Wrap it:

```typescript
import { ErrorPrettier } from '@venizia/ignis-helpers';

logger.error('Failed to create user | %s', ErrorPrettier.format({ error }));
```

You get the identity, the root `cause` with its code, the driver's `hint`, the full message and the top stack frames - each on its own line, with the message's real newlines intact. The duplicated statement and the noisy driver internals are gone.

Pass `includeStack: false` when the error is one you raised yourself and the frames add nothing. For a JSON sink, `ErrorPrettier.summarize({ error })` returns the same projection as a typed object instead of a string.

### Switch the output format

`APP_ENV_LOGGER_FORMAT` controls plain text (default) vs. JSON output.

```bash
APP_ENV_LOGGER_FORMAT=text   # 2024-01-11T10:30:00.000Z [APP] info: [UserService] User created
APP_ENV_LOGGER_FORMAT=json   # {"level":"info","message":"[UserService] User created", ...}
```

The `[APP]` label comes from `APP_ENV_APPLICATION_NAME` (defaults to `'APP'`).

### Enable daily file rotation

Point `APP_ENV_LOGGER_FOLDER_PATH` at a directory. Rotation frequency, size cap, and retention are also env-driven. Without this variable, no log files are written - console (and UDP, if configured) remain the only outputs.

```bash
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs
APP_ENV_LOGGER_FILE_MAX_FILES=30d
```

| Setting | Default |
|---|---|
| Rotation frequency | `1h` |
| Max file size | `100m` |
| Retention | `5d` |

Full programmatic configuration - custom prefixes, custom retention - is in the [Full reference](/extensions/helpers/logger/reference).

### Forward logs over UDP

Set all four `APP_ENV_LOGGER_DGRAM_*` variables - the transport is silently skipped if any one is missing.

```bash
APP_ENV_LOGGER_DGRAM_HOST=127.0.0.1
APP_ENV_LOGGER_DGRAM_PORT=5000
APP_ENV_LOGGER_DGRAM_LABEL=my-app
APP_ENV_LOGGER_DGRAM_LEVELS=error,warn,info
```

## See also

- [Full reference](/extensions/helpers/logger/reference) - every export, transport option, log level, and edge case
- [Services](/guides/core-concepts/services) - logging in services
- [Controllers](/guides/core-concepts/rest-controllers) - logging in controllers
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Request Tracker Component](/extensions/components/request-tracker) - request logging
- [Winston documentation](https://github.com/winstonjs/winston) - underlying logging library

**Files:**

- [`packages/helpers/src/modules/logger/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/common/types.ts) - `ILogger`, the contract every consumer types against
- [`packages/helpers/src/modules/logger/winston/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/logger.ts) - `WinstonLogger`, `Logger` alias
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory`, `ApplicationLogger`
- [`packages/helpers/src/modules/logger/winston/define.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/define.ts) - Winston setup, transports, env configuration
