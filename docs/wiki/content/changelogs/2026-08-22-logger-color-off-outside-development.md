---
title: Log Lines Stop Carrying Color Outside Development
description: The console transport now colorizes only in a development NODE_ENV. Production, staging and uat get plain text, so a log file or an aggregator no longer stores ANSI escape codes.
---

# Changelog - 2026-08-22

## Logger color follows the environment

<Badge type="warning" text="Behavior Change" />
<Badge type="tip" text="Enhancement" />

**In one line.** Console log lines are colorized in development and plain everywhere else.

## What changed

- **Color is now a decision, not a constant.** The console transport used to call winston's colorizer unconditionally in `text` format. It now asks `resolveLoggerColorize()` first.
- **`APP_ENV_LOGGER_COLOR` is the override.** Set it to `true` or `false` to decide for yourself, in any environment.
- **`NO_COLOR` is honored.** The [no-color.org](https://no-color.org) convention, which most CLI tools already follow.
- **`ICustomLoggerOptions` gained `colorize`.** An application building its own winston logger can pass the decision in directly.

The first rule that matches wins:

| Rule | Result |
|------|--------|
| `APP_ENV_LOGGER_COLOR` is set | That value |
| `NO_COLOR` is set and non-empty | Off |
| `NODE_ENV` is `local`, `debug`, `development`, `dev` or `sit` - or unset | On |
| Anything else, including `production`, `staging`, `uat` and unrecognized names | Off |

That last row is the same fail-closed boundary the error sanitizer draws. Color is a terminal affordance for our own engineers; every other environment ships its lines to a file or an aggregator, where an escape code is noise every grep has to strip.

## Who is affected

- **Anyone running with `NODE_ENV=production`, `staging` or `uat`.** Console lines lose their color. Nothing else about them changes - same timestamp, same label, same message.
- **Anyone running in development.** Nothing changes.
- **Applications on the pino provider.** The rule is a veto only. When it allows color, `pino-pretty` still applies its own terminal detection, so piping to a file stays clean.
- **File and UDP transports.** Untouched. They never colorized, in any environment.

## If you want the color back

```bash
APP_ENV_LOGGER_COLOR=true
```

That works in any environment, and it beats `NO_COLOR`.

See [Logger reference - Color](/extensions/helpers/logger/reference#color) for the full rules.
