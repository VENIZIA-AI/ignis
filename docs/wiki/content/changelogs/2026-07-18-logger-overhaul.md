---
title: Logger Overhaul - ILogger Tier, Pino Provider, Single-Provider Loading
description: The logger is rebuilt behind an ILogger contract with five levels, two swappable providers loaded one at a time, a reworked HfLogger and a redaction kill-switch.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-07-18

## Logger Overhaul

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" />

**In one line.** You type against `ILogger`, pick winston or pino with one line at the entrypoint, and only that provider is loaded.

## What changed

- **`ILogger` contract.** `LoggerFactory.getLogger()` and `BaseHelper.logger` return `ILogger`. New exports: `ILogger`, `AbstractLogger`, `BaseLogger`, `WinstonLogger`, `PinoLogger`, `ILoggerProvider`.
- **Pick a provider.** Call `LoggerFactory.use({ provider })` once; order does not matter, and loggers captured at import time follow it.
- **One provider loads.** An app registering pino never loads or bundles winston. Both providers are sub-path only (`/winston`, `/pino`) and all provider packages are optional peers.
- **Pino provider.** NDJSON to stdout by default, `pino-pretty` when `APP_ENV_LOGGER_FORMAT=text`, and `pino-roll` rotation honoring the `APP_ENV_LOGGER_FILE_*` variables. Roughly 2.5x faster per line than winston. JSON key names, single-destination output and the lack of a UDP transport differ from winston by design. See the [guide](/extensions/helpers/logger/pino).
- **Five log levels.** `debug`, `info`, `warn`, `error` and `emerg`, each a direct method, plus `log(level, ...)`. The default `debug` floor admits every level on both providers.
- **`HfLogger` reworked.** Entries no longer have NUL padding or stale tails. It implements `ILogger`, formats args (deep inspection and redaction) instead of dropping them, reports how many entries the ring overwrote, allocates its 16MB ring lazily on first `HfLogger.get()`, and has `stop()` and pluggable `sink` and `filePath` options.
- **Redaction kill-switch.** `APP_ENV_LOGGER_DO_REDACT=false` (that literal only) turns redaction into a pass-through for local debugging. It covers log arguments, fetcher request logs and connection URLs. Never disable it in production.

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger });
```

## Who is affected

- **Untyped call sites** (`this.logger.info(...)`, `LoggerFactory.getLogger([...])`, `.for('method')`). No change needed.
- **Apps importing winston names, using `applicationLogger`, annotating `: Logger`, or removed levels.** See breaking changes.
- **Compiled binaries (`bun build --compile`).** Must call `LoggerFactory.use({ provider })` explicitly, because only a class reference carries a provider into a bundle.

## Breaking changes

| Change | Migration |
|---|---|
| Winston names left the root barrel | Import `Logger`, `WinstonLogger`, `defineCustomLogger`, formatters, `DgramTransport` and their option types from `@venizia/ignis-helpers/winston` |
| winston is an optional peer | Apps relying on the default: `bun add winston winston-transport winston-daily-rotate-file` |
| Compiled binaries | Call `LoggerFactory.use({ provider })` explicitly |
| `applicationLogger` removed (value and `ApplicationLogger` type alias) | `ApplicationLogger.get('YourScope')`; annotate with `ILogger` |
| `: Logger` annotations | Widen to `: ILogger` (also for `.for()` results) |
| `ApplicationLogger` is no longer a class | `instanceof AbstractLogger` for provider-agnostic checks |
| Removed levels `alert`, `http`, `verbose`, `silly` | `alert` to `emerg`, `http` and `verbose` to `info` or `debug`, `silly` to `debug` |
| `ICustomLoggerOptions` field names | `logLevels` to `levels`, `logColors` to `colors`, `loggerFormatter` to `formatter` |
| `HfLogger` flushed line format | Now `<ISO time> [<levelName>] <scope> <message>`; the old NUL-padded shape was corrupt output |

## Details

- Wrappers resolve their provider at the first log call, so the wrapper cost is one property read.
- Winston keeps file and UDP lines ANSI-free, and file transports stay opt-in via `APP_ENV_LOGGER_FOLDER_PATH`.
- Environment variables, the level guide and every API signature: [Full reference](/extensions/helpers/logger/reference).
