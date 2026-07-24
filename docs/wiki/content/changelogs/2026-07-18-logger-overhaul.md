---
title: Logger Overhaul - ILogger Tier, Pino Provider, Single-Provider Loading
description: The logger was rebuilt behind an ILogger contract - five levels, two swappable providers loaded one at a time, a reworked HfLogger, and a redaction kill-switch.
---

# Changelog - 2026-07-18

## Logger Overhaul

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" />

**In one line.** Consumers now type against `ILogger` and never name a provider. The app picks winston or pino with one line at the entrypoint, and loads only that one. `HfLogger` emits correct output and implements `ILogger`.

## Architecture

`modules/logger/` follows IGNIS's house format:

```
common/       ILogger, TLogLevel, LogLevels, LoggerFormats
base/         AbstractLogger -> BaseLogger (scope, prefix, DEBUG gate, .for(), one write() sink)
formatting/   formatLogMessage (deep %s inspection + secret redaction)
winston/      WinstonLogger + define.ts, formatters, transports   -> sub-path /winston
pino/         PinoLogger + define.ts                              -> sub-path /pino
hf/           HfLogger, HfLogFlusher (separate ring-buffer pipeline)
factory.ts    LoggerFactory - the one selection point
```

- **`ILogger` is the contract.** `LoggerFactory.getLogger()` and `BaseHelper.logger` return `ILogger`; which provider backs it is invisible.
- **New exports:** `ILogger`, `AbstractLogger`, `BaseLogger`, `WinstonLogger`, `PinoLogger`, `ILoggerProvider`.

## Provider registration and single-provider loading

```typescript
// entrypoint - order-independent
import { LoggerFactory } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger });
```

- **Swap-on-use.** The factory hands out stable wrappers and re-points every one at `use()`. A module-level `const logger = LoggerFactory.getLogger([...])`, captured at import time, still follows the registration. Wrapper cost: one property read.
- **Exactly ONE provider loads.** Wrappers resolve their delegate at the first log call, and the winston default sits behind a `createRequire` boundary a bundler cannot resolve. An app registering pino never loads or bundles winston.
- **Both providers are sub-path only.** The root barrel is provider-free; all winston names live at `@venizia/ignis-helpers/winston`, pino at `/pino`. All provider packages are optional peers.
- **Compiled binaries** (`bun build --compile`) MUST register explicitly - only a class reference carries a provider into a bundle.

**Pino provider** ([guide](/extensions/helpers/logger/pino)): NDJSON to stdout by default, `pino-pretty` on `APP_ENV_LOGGER_FORMAT=text`, `pino-roll` rotation honoring the existing `APP_ENV_LOGGER_FILE_*` variables. Roughly 2.5x faster per line than winston (~0.5us vs ~1.25us). Pino stays pino-native - JSON key names, single-destination output, and no UDP transport differ from winston by design.

## Five log levels

`debug`, `info`, `warn`, `error`, `emerg` - each a direct method, plus `log(level, ...)` for dynamic choice. `alert`, `http`, `verbose`, and `silly` were removed (zero call sites, no consuming infrastructure; `alert` duplicated `emerg`). The default `debug` floor admits every level on both providers.

| Level | Priority | Color |
|-------|----------|-------|
| `error` | 0 | red |
| `emerg` | 0 | red |
| `warn` | 1 | yellow |
| `info` | 2 | green |
| `debug` | 3 | blue |

## HfLogger rework

- **Correct output.** Entries carry explicit scope/message length bytes - no NUL padding, no stale tails from a longer overwritten message.
- **`ILogger` conformance.** All five level methods plus `log` and `for`; args are formatted (deep inspection + redaction), never dropped. The pre-encoded bytes hot path survives as an overload.
- **Exact lap accounting.** Every drain batch reports how many entries the ring overwrote; the default sink emits a `warn` marker.
- **Lazy 16MB ring** - allocated on first `HfLogger.get()`, not at import - lives on a plain `ArrayBuffer`. The design was always single-thread, so `SharedArrayBuffer` shared nothing.
- **Flusher lifecycle:** `stop()`, an unref'd interval, batched yielding drains, and pluggable `sink` / `filePath` options.
- Measured ~46-66ns per enqueue, ~14x faster than pino sync on the same machine; heap flat over 1M logs.

## Secret redaction kill-switch

`APP_ENV_LOGGER_DO_REDACT=false` (that literal only - fail-closed) turns redaction into a pass-through for local debugging. It covers log arguments, fetcher request logs, and connection URLs. Unset or any other value keeps today's behavior. Never disable in production.

## Breaking changes

| Change | Migration |
|---|---|
| Winston names left the root barrel | Import `Logger`, `WinstonLogger`, `defineCustomLogger`, formatters, `DgramTransport`, and their option types from `@venizia/ignis-helpers/winston` |
| winston is an optional peer | Apps relying on the default: `bun add winston winston-transport winston-daily-rotate-file` |
| Compiled binaries | Call `LoggerFactory.use({ provider })` explicitly |
| `applicationLogger` removed (value and `ApplicationLogger` type alias) | `ApplicationLogger.get('YourScope')`; annotate with `ILogger` |
| `: Logger` annotations | Widen to `: ILogger` (also for `.for()` results) |
| `ApplicationLogger` is no longer a class | `instanceof AbstractLogger` for provider-agnostic checks |
| Removed levels `alert`/`http`/`verbose`/`silly` | `alert` -> `emerg`, `http`/`verbose` -> `info` or `debug`, `silly` -> `debug` |
| `ICustomLoggerOptions` field names | `logLevels` -> `levels`, `logColors` -> `colors`, `loggerFormatter` -> `formatter` |
| HfLogger flushed line format | Now `<ISO time> [<levelName>] <scope> <message>`; the old NUL-padded shape was corrupt output, not a contract |

Untyped call sites (`this.logger.info(...)`, `LoggerFactory.getLogger([...])`, `.for('method')`) need no change.

## Details

- **HfLogger entry layout v2** (256 bytes total):

  | Field | Bytes |
  |---|---|
  | `float64` epoch-ms timestamp | 0-7 |
  | Level code | 8 |
  | Scope length | 9 |
  | Scope | 10-41 |
  | Message length | 42 |
  | Message (cap 213 bytes) | 43-255 |

  Encode cache is FIFO-bounded at 4096.
- **Winston pipeline:** two-stage formatting - shared prep on the logger, per-transport assembly. Console colorizes; file and UDP lines stay ANSI-free. File transports remain opt-in via `APP_ENV_LOGGER_FOLDER_PATH`.
- Environment variables, the level guide, and every API signature: [Full reference](/extensions/helpers/logger/reference).
