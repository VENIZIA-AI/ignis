---
title: Pino Provider
description: The throughput logger provider - NDJSON output, one-line registration via LoggerFactory.use, three optional peers, and the honest differences from the Winston provider.
difficulty: intermediate
---

# Pino Provider

`PinoLogger` is the second logger provider behind the `ILogger` contract - the throughput option. Winston remains the DEFAULT. Nothing changes for apps that never register pino.

| Provider | Output | Speed (measured) |
|---|---|---|
| Winston (built-in) | Colorized console, daily-rotating info/error files, UDP shipping | ~1.2-1.6us/line |
| Pino | Newline-delimited JSON | ~0.5-0.6us/line |

## Registration - one line, order-independent

```typescript
// entrypoint (for example, src/index.ts)
import { LoggerFactory } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger });
```

The two providers register symmetrically - `WinstonLogger` lives at `@venizia/ignis-helpers/winston` the same way. Both are sub-path only, with optional peers. Exactly ONE provider is ever loaded - registering pino here means winston is never loaded, nor bundled.

From that moment, every factory-issued logger runs on pino:

- `BaseHelper.logger` in every controller, service, repository, and helper
- `ApplicationLogger.get(...)`
- Even a module-level `const logger = LoggerFactory.getLogger([...])`, captured at import time before this line ran - thanks to swap-on-use delegation

Import order doesn't matter. The factory re-points every wrapper it has ever issued when `use()` is called.

> [!IMPORTANT]
> `Logger.get(...)` (the concrete `WinstonLogger` alias) and `defineCustomLogger` deliberately do NOT follow the registration - they name winston explicitly. See the name/role table in the [Full reference](/extensions/helpers/logger/reference).

## Installing the peers

The provider lives at the sub-path `@venizia/ignis-helpers/pino` only - importing the root barrel never pulls pino into a bundle (test-enforced). Three optional peers, each needed only when its mode is active:

| Peer | Needed when |
|------|-------------|
| `pino` | always (the sub-path values-imports it) |
| `pino-pretty` | `APP_ENV_LOGGER_FORMAT=text` (pretty dev output, colorized when the environment allows it) |
| `pino-roll` | `APP_ENV_LOGGER_FOLDER_PATH` is set (file rotation) |

A missing peer fails with the standard install-hint error BEFORE any worker thread spawns.

## Output modes

| Trigger | Output |
|---|---|
| `APP_ENV_LOGGER_FORMAT=json`, or unset in production practice | NDJSON to stdout - the k8s/docker collector pattern |
| `APP_ENV_LOGGER_FORMAT=text` | Pretty lines via a `pino-pretty` worker-thread transport - dev only. Color follows the [Color](./reference#color) rules, and `pino-pretty` still drops it when stdout is not a terminal |
| `APP_ENV_LOGGER_FOLDER_PATH` is set | A rotating file via `pino-roll`, honoring the same env vars winston uses (table below) |

**`pino-roll` file rotation - env var mapping:**

| Env | pino-roll meaning |
|-----|-------------------|
| `APP_ENV_LOGGER_FILE_FREQUENCY` | `'1h'` -> hourly (default); `'1d'`/`'24h'` -> daily; anything else -> hourly with a warning |
| `APP_ENV_LOGGER_FILE_MAX_SIZE` | max size per file (default `100m`) |
| `APP_ENV_LOGGER_FILE_MAX_FILES` | retention -> file count: `'5d'` -> 120 files (hourly) / 5 (daily); a bare integer -> that count |
| `APP_ENV_LOGGER_FILE_DATE_PATTERN` | NOT supported (pino-roll has no date pattern) |

`APP_ENV_LOGGER_LEVEL` sets the floor exactly as with winston. `emerg` is the single custom pino level, above `error`. The default `debug` floor admits every level - identical to the winston provider.

## What stays identical, what differs

Identical by construction:

- the `[Scope] ` message prefix
- args formatting through `formatLogMessage` - deep inspection plus secret redaction; a `token` field renders `[REDACTED]` on pino exactly as on winston
- the level vocabulary and floor semantics
- the `DEBUG` gate on `debug()`

Different on purpose (pino stays pino-native - every parity shim would cost the speed you came for):

| Aspect | Winston provider | Pino provider |
|--------|------------------|---------------|
| JSON keys | `level` (name), `message`, `label`, `timestamp` (ISO) | `level` (NUMBER), `msg`, `name`, `time` (epoch ms), `pid`, `hostname` |
| Text mode | built-in colorized console | `pino-pretty` (optional peer, worker thread) |
| File mode | daily-rotate, info/error SPLIT files, date pattern | `pino-roll`, ONE file, no date pattern |
| UDP | `DgramTransport` | none |
| Console + file simultaneously | yes | no (one destination) |
| Uncaught-exception file | yes (exceptionHandlers) | no |

If your operations depend on the left column, stay on winston - it is not deprecated and not going anywhere.

## Advanced: injecting a backing instance

`setPinoBackingLogger({ instance })` replaces the env-driven singleton with a pino instance you configured yourself. Tests use this with an in-memory destination; apps can use it for exotic transports. The previous instance's transport is flushed and closed on replacement. `buildPinoOptions()` and `resolveDestinationPlan()` are exported for building compatible options.

## See also

- [Logger overview](/extensions/helpers/logger/) - the standard provider and common tasks
- [Full reference](/extensions/helpers/logger/reference) - the name/role table (which names follow `use()`), `ILoggerProvider`

**Files:**

- [`packages/helpers/src/modules/logger/pino/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/pino/logger.ts) - `PinoLogger`
- [`packages/helpers/src/modules/logger/pino/destination.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/pino/destination.ts) - destination plan
- [`packages/helpers/src/modules/logger/pino/backing.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/pino/backing.ts) - backing singleton
- [`packages/helpers/src/modules/logger/pino/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/pino/common/constants.ts) - level table
- [`packages/helpers/src/modules/logger/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/factory.ts) - `LoggerFactory.use`, swap-on-use delegation
