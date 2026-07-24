---
title: Logger Correctness Pass
description: ANSI-free log files, a real level floor via APP_ENV_LOGGER_LEVEL, opt-in file logging, fixed custom-logger caching, and a crash-proof UDP transport.
---

# Changelog - 2026-07-17

## Logger Correctness Pass

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" />

**In one line.** The Winston pipeline now formats per transport - color on console only, valid JSON everywhere. It honors a configurable level floor, and writes files only when asked to. It can no longer crash the process over a lost UDP log line.

## What changed

- **Log files no longer contain ANSI color codes.** Formatting now happens in two stages.
- A shared preparation stage on the logger handles the label, timestamp, error normalization, and deep splat.
- A per-transport assembly stage applies it: the console colorizes, files and UDP get the same line plain.
- **JSON mode emits valid JSON.** The dead `colorize()` sitting after `json()` is gone.
- `errors({ stack: true })` now runs before assembly instead of after `printf`, where it used to be a no-op.
- **`APP_ENV_LOGGER_LEVEL` sets the logger-level floor** (default `debug`, preserving current behavior). Transports without their own level inherit it. This also un-caps the UDP transport, which was silently pinned to `info` by Winston's default logger level.
- **File logging is opt-in.** Without `APP_ENV_LOGGER_FOLDER_PATH`, no rotating file transports are created. Previously the folder defaulted to `./` and every process scattered `*-info-*.log` files into its working directory.
- **Custom-logger caching is fixed.** `Logger.get(scope, customLogger)` used to cache under `scope:custom`.
- A second, different Winston instance for the same scope silently got the first one's wrapper.
- Worse, `.for(method)` on a custom-backed logger silently fell back to the default `applicationLogger`.
- A custom-backed logger is now a fresh wrapper per call, and `.for()` keeps its backing instance.
- **`DgramTransport` cannot crash the process.** A failed UDP `send` used to `emit('error')` with no listener attached - a process-killing unhandled error. It now logs the failure and drops the socket so the next line reconnects.

## Who is affected

- **Apps using `LoggerFactory.getLogger` / `this.logger.for(...)`.** No action needed - the API surface is unchanged.
- **Deployments relying on default `./` file logs WITHOUT `APP_ENV_LOGGER_FOLDER_PATH`.** File logs stop appearing until the variable is set. Console output is unchanged, so stdout-based collection (Docker/Kubernetes) is unaffected. Set `APP_ENV_LOGGER_FOLDER_PATH` to keep rotating files.
- **Log aggregators parsing text-format files.** Lines no longer carry ANSI escapes - strip-ANSI workarounds can be removed.

## Details

- The `text` console line shape is unchanged: `<timestamp> [<label>] <level>: <message>`.
- New `ICustomLoggerOptions` fields: `format?: 'json' | 'text'` and `level?: TLogLevel`, both defaulting to the corresponding env vars. Passing `loggerFormatter` still overrides everything, applied identically to every transport as before.
- New exports: `resolveLoggerLevel({ configured })` and `resolveDefaultTransportOptions()`. `resolveLoggerLevel` validates against `LogLevels`, falling back to `debug` with a console warning. `resolveDefaultTransportOptions` returns the env-driven default transport set, resolved at call time.
- `definePrettyLoggerFormatter` gained `colorize?: boolean` (default `true`) for building plain text formatters.

| File | Package |
|------|---------|
| `src/modules/logger/default-logger.ts` | helpers |
| `src/modules/logger/application-logger.ts` | helpers |
| `src/modules/logger/transports/dgram.transport.ts` | helpers |
