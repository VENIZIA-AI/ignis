---
title: Logger
description: Scoped, cached logging via LoggerFactory - the console by default, Winston on the server, Pino by choice, the same in a browser and a script
difficulty: beginner
---

# Logger

IGNIS gives every helper a scoped `ILogger`. `LoggerFactory` builds it from one provider: the console by default, Winston when `@venizia/ignis` starts an application, or the one you choose with `LoggerFactory.use`. The Winston provider has console, daily-rotating file, and UDP transports built in.

## In one example

The smallest real use: get a scoped logger and log with it.

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['UserService']);
logger.info('User created');
// Output: [UserService] User created
```

Every helper in the framework gets its `this.logger` from the same factory, scoped to the helper, for free.

## How it works

- **Typed against `ILogger`.** Every consumer - including `BaseHelper.logger` - gets the `ILogger` interface, never a concrete class.
- **Provider-based.** `LoggerFactory.use({ provider, level })` chooses the logger engine and the level. The default provider is `ConsoleLogger`, which needs no install and works in a browser. `@venizia/ignis` picks Winston at `initialize()` unless the application already chose one; [pino](/extensions/helpers/logger/pino) is the throughput option. Every factory-issued logger follows the choice, even one captured at import time.
- **Scoped and cached.** `LoggerFactory.getLogger(scopes)` joins the scopes with `-` and caches the result per scope. The same scope always returns the same instance. A helper's `this.logger` goes through it on first read, pre-scoped to the helper - see [Swap the logger on a helper](#swap-the-logger-on-a-helper).
- **Custom-backed loggers are the exception.** `Logger.get(scope, customWinstonLogger)` (from the `/winston` sub-path) is NOT cached. Each call returns a fresh wrapper over the instance you passed in.
- **Method scoping.** `.for(methodName)` returns a child logger scoped to `<scope>-<methodName>` (also cached), so each line shows where it came from.
- **Level floor.** With Winston, `APP_ENV_LOGGER_LEVEL` (default `debug`) sets the logger-level floor. Transports without their own level inherit it. A `level` passed to `LoggerFactory.use` applies to every provider and wins over it.
- **`debug()` is gated.** Every provider shares one rule: `debug` emits only when `DEBUG` is truthy and `NODE_ENV` is unset or listed in `Environment.COMMON_ENVS`. Extend that set via `APP_ENV_EXTRA_LOG_ENVS`. The environment is read once - runtime env changes need a restart. Where there is no `process` (a browser) `debug` is off. `LoggerFactory.use({ level })` overrides the rule.

**Log levels**

Five levels, each with a direct method: `debug`, `info`, `warn`, `error`, `emerg`. The generic `.log(level, ...)` remains for picking the level dynamically. What each level means, and when to use it, is in the [level guide](/extensions/helpers/logger/reference#what-each-level-means).

**Transports**

| Transport | Turns on when |
|-----------|---------------|
| Console | Always |
| Daily-rotating file | `APP_ENV_LOGGER_FOLDER_PATH` is set |
| UDP (`DgramTransport`) | All four UDP `APP_ENV_LOGGER_DGRAM_*` variables are set |

Output shape (plain text or JSON) follows `APP_ENV_LOGGER_FORMAT`. Color codes appear only on the console, and only in a development `NODE_ENV` - file and UDP output never carries ANSI escapes. See [Color](./reference#color) to override.

For extreme hot paths, `HfLogger` is a separate ring-buffer logger outside this pipeline, with its own [usage guide](/extensions/helpers/logger/hf-logger). The [Full reference](/extensions/helpers/logger/reference) covers everything else.

## Common tasks

### Get a scoped logger

Use `LoggerFactory.getLogger` with an array of scope segments. It caches by scope and follows the chosen provider.

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

const scoped = LoggerFactory.getLogger(['Payment', 'Stripe']); // [Payment-Stripe]
const single = LoggerFactory.getLogger(['MyService']);         // [MyService]
```

`ApplicationLogger` is removed. `devz codemod namespace-functions` rewrites `ApplicationLogger.get(...)` to `LoggerFactory.getLogger([scope])` and fixes the import.

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

`%s` routes the error through `ErrorPrettier`, which projects it down to identity, cause and frames. `%j` keeps every enumerable own property instead, so a driver error takes its whole query along and a `jose` error its whole payload. Always pair an `Error` argument with `%s`.

```typescript
logger.error('Failed to create user: %s', error); // prints message + stack
```

A mistaken `%j` is no longer a silent loss: the formatter projects `message` and `stack` in before `JSON.stringify` runs, which on its own would drop both (they are non-enumerable). It is still the wrong placeholder for an error.

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

### Swap the logger on a helper

To put your own logger on a helper - a test spy, say - assign it. Assignment works before or after the first read:

```typescript
helper.logger = spyLogger;
```

Until you assign one, `this.logger` resolves on its first read and then stays on the instance as a plain property. Every later read is a property read. The property is non-enumerable, so it never shows up in `Object.keys`, in JSON, or in a spread.

A subclass cannot redeclare `logger` as a field. It is an accessor on `BaseHelper`, and TypeScript refuses the field with TS2610.

### Choose the provider and the level

One call chooses both, in a server, a script and a browser app: `LoggerFactory.use({ provider, level })`. Both fields are optional. Call it once, at the entrypoint.

```typescript
import { LoggerFactory, LogLevels } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger, level: LogLevels.INFO });
```

- **The default is the console.** With no call, every logger is a `ConsoleLogger`. It needs no install, and `LoggerFactory` and `ConsoleLogger` are both exported from `@venizia/ignis-helpers/core`, so a browser bundle can use them.
- **A script gets the console.** A script that imports only helpers or connectors logs to the console with no setup and no warning. To use Pino or Winston, call `LoggerFactory.use({ provider })` with the class from `@venizia/ignis-helpers/pino` or `/winston`.
- **`@venizia/ignis` picks Winston.** At `initialize()` it selects Winston unless your application already chose a provider. If `winston` is not installed, the console stays. A compiled binary needs no `LoggerFactory.use` for this.
- **`level` is a `LogLevels` value you pass.** The factory applies it to every provider the same way: a line below the level is dropped before the provider sees it. Without `level`, each provider applies its own gate.
- **The debug gate.** The console writes `debug` only when `DEBUG` is truthy and the environment is allowed (see [How it works](#how-it-works)). In a browser there is no `process`, so `debug` is off. Pass `level: LogLevels.DEBUG` to turn it on, or `level: LogLevels.INFO` (or above) to silence it, whatever the environment says.
- **`use` can run after loggers exist.** Loggers already issued, children from `.for()` included, re-point to the new provider on their next line. Nothing has to be rebuilt.
- **`useUnlessChosen({ provider })`** chooses a provider only when the application has not. It is for a framework's startup default, never an override. `LoggerFactory.isChosen()` says whether one was chosen.

**In a React project,** `react-hooks/rules-of-hooks` reports `LoggerFactory.use(...)` and `LoggerFactory.useUnlessChosen(...)` when they run inside a plain function or at the top level of a module: a call named `use*` on a `PascalCase` object reads as a hook. They are not hooks, and the rule has no option to exclude a name, so say so at the call site, with the reason:

```typescript
// eslint-disable-next-line react-hooks/rules-of-hooks -- LoggerFactory.use is a static method, not a React hook
LoggerFactory.use({ level: LogLevels.INFO });
```

Do not copy the method into a variable to dodge the report (`const { use } = LoggerFactory`): `use` reads `this`, and a detached call fails.

A browser app that keeps debug lines out of production:

```typescript
import { LoggerFactory, LogLevels } from '@venizia/ignis-helpers/core';

LoggerFactory.use({ level: import.meta.env.DEV ? LogLevels.DEBUG : LogLevels.INFO });
```

A bundle can carry two copies of the module (an application's ESM import and a package's CJS require). The chosen provider and the level live in `globalThis` slots, so a `use` call in one copy reaches the other.

`LoggerFactory.reset()` goes back to the console and no level. It is for a test or a host that starts over.

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
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory`
- [`packages/helpers/src/modules/logger/base/console.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/base/console.ts) - `ConsoleLogger`, the default provider
- [`packages/helpers/src/modules/logger/common/debug-gate.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/common/debug-gate.ts) - `LoggerDebugGate`, the rule behind `debug`
- [`packages/helpers/src/modules/logger/winston/logger-factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/logger-factory.ts) - Winston setup, transports, env configuration
