---
title: Logger Correctness Pass
description: Log files no longer contain ANSI codes, APP_ENV_LOGGER_LEVEL sets a real level floor, file logging is opt-in, custom loggers cache correctly, and a failed UDP send can no longer crash the process.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-07-17

## Logger Correctness Pass

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Color appears on the console only, JSON mode emits valid JSON, the log level is configurable, files are written only when you ask, and a lost UDP log line cannot crash the process.

## What changed

- **ANSI-free log files.** The console colorizes; files and UDP get the same line plain. JSON mode emits valid JSON, and `errors({ stack: true })` now takes effect.
- **`APP_ENV_LOGGER_LEVEL` sets the level floor.** Default `debug`, so current behavior is kept. Transports without their own level inherit it. This also un-caps the UDP transport, which was silently pinned to `info`.
- **File logging is opt-in.** Without `APP_ENV_LOGGER_FOLDER_PATH`, no rotating file transports are created. Before, the folder defaulted to `./` and every process scattered `*-info-*.log` files into its working directory.
- **Custom-logger caching fixed.** `Logger.get(scope, customLogger)` cached under `scope:custom`, so a second, different Winston instance for the same scope got the first one's wrapper, and `.for(method)` fell back to the default `applicationLogger`. A custom-backed logger is now a fresh wrapper per call and `.for()` keeps its backing instance.
- **`DgramTransport` cannot crash the process.** A failed UDP `send` used to raise an unhandled error. It now logs the failure and drops the socket so the next line reconnects.

## Who is affected

- **Apps using `LoggerFactory.getLogger` or `this.logger.for(...)`.** No action needed.
- **Deployments relying on default `./` file logs without `APP_ENV_LOGGER_FOLDER_PATH`.** File logs stop until you set the variable. Console output is unchanged, so stdout collection (Docker, Kubernetes) is unaffected.
- **Log aggregators parsing text files.** Lines no longer carry ANSI escapes, so strip-ANSI workarounds can go.

## Details

- The `text` console line shape is unchanged: `<timestamp> [<label>] <level>: <message>`.
- New `ICustomLoggerOptions` fields: `format?: 'json' | 'text'` and `level?: TLogLevel`, defaulting to the env variables. Passing `loggerFormatter` still overrides everything.
- New exports: `resolveLoggerLevel({ configured })` (validates against `LogLevels`, falls back to `debug` with a console warning) and `resolveDefaultTransportOptions()`.
- `definePrettyLoggerFormatter` gained `colorize?: boolean` (default `true`).
