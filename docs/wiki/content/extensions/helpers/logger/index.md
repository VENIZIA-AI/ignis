---
title: Logger
description: Scoped, cached Winston logging with console, daily-rotating file, and UDP transports
difficulty: beginner
---

# Logger

The logger helper wraps Winston in a scoped, cached `Logger` class with console, daily-rotating file, and UDP transports built in.

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

- **One shared Winston instance.** Every logger wraps a single `applicationLogger`, built once by `defineCustomLogger` from the `APP_ENV_LOGGER_*` variables at module load.
- **Scoped and cached.** `LoggerFactory.getLogger(scopes)` joins the scopes with `-` and calls `Logger.get(scope)`, which caches per scope - the same scope returns the same instance. `BaseHelper` calls this in its constructor, so every helper gets `this.logger` scoped automatically.
- **Method scoping.** `.for(methodName)` returns a child logger scoped to `<scope>-<methodName>` (also cached), so each line shows where it came from.
- **`debug()` is gated.** It emits only when `DEBUG=true` and `NODE_ENV` is unset or in `Environment.COMMON_ENVS` (extend via `APP_ENV_EXTRA_LOG_ENVS`). The check runs once at module load - runtime env changes need a restart.

**Log levels**

| Kind | Levels |
|------|--------|
| Direct methods | `info`, `warn`, `error`, `emerg`, `debug` |
| Via `.log(level, ...)` | `alert`, `http`, `verbose`, `silly` |

**Transports**

| Transport | Turns on when |
|-----------|---------------|
| Console | Always |
| Daily-rotating file | The file `APP_ENV_LOGGER_*` variables are set |
| UDP (`DgramTransport`) | The UDP `APP_ENV_LOGGER_*` variables are set |

Output shape (plain text or JSON) follows `APP_ENV_LOGGER_FORMAT`. For extreme hot paths, `HfLogger` is a separate zero-allocation ring-buffer logger outside this pipeline - see the [Full reference](/extensions/helpers/logger/reference), which also covers the `ApplicationLogger` compatibility alias.

## Common tasks

### Get a scoped logger

Use `LoggerFactory.getLogger` with an array of scope segments, or `Logger.get` directly with a single string. Both cache by scope.

```typescript
import { Logger, LoggerFactory } from '@venizia/ignis-helpers';

const scoped = LoggerFactory.getLogger(['Payment', 'Stripe']); // [Payment-Stripe]
const direct = Logger.get('MyService');                        // [MyService]
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

`message` and `stack` are non-enumerable on a native `Error`. `%j` formats via `JSON.stringify`, which only visits enumerable own properties, so it silently drops both. Always pair an `Error` argument with `%s`.

```typescript
logger.error('Failed to create user: %s', error); // prints message + stack
```

### Switch the output format

`APP_ENV_LOGGER_FORMAT` controls plain text (default) vs. JSON output.

```bash
APP_ENV_LOGGER_FORMAT=text   # 2024-01-11T10:30:00.000Z [APP] info: [UserService] User created
APP_ENV_LOGGER_FORMAT=json   # {"level":"info","message":"[UserService] User created", ...}
```

The `[APP]` label comes from `APP_ENV_APPLICATION_NAME` (defaults to `'APP'`).

### Enable daily file rotation

Point `APP_ENV_LOGGER_FOLDER_PATH` at a directory; rotation frequency, size cap, and retention are also env-driven.

```bash
APP_ENV_LOGGER_FOLDER_PATH=./app_data/logs
APP_ENV_LOGGER_FILE_MAX_FILES=30d
```

Defaults: `1h` rotation frequency, `100m` max size per file, `5d` retention. Programmatic configuration (per-transport prefixes, custom retention) is in the [Full reference](/extensions/helpers/logger/reference).

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

- [`packages/helpers/src/modules/logger/application-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/application-logger.ts) - `Logger` class and caching
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory`
- [`packages/helpers/src/modules/logger/default-logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/default-logger.ts) - Winston setup, transports, env configuration
