---
title: Log Lines Stop Carrying Color Outside Development
description: The console transport now colorizes only in a development NODE_ENV, so production, staging and uat log files no longer store ANSI escape codes.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-08-22

## Logger color follows the environment

<Badge type="warning" text="Behavior Change" />
<Badge type="tip" text="Enhancement" />

**In one line.** Console log lines are colorized in development and plain everywhere else.

## What changed

- **Color is now a decision.** The console transport asks `resolveLoggerColorize()` instead of always colorizing in `text` format.
- **`APP_ENV_LOGGER_COLOR` is the override.** Set it to `true` or `false` in any environment.
- **`NO_COLOR` is honored,** following the [no-color.org](https://no-color.org) convention.
- **`ICustomLoggerOptions` gained `colorize`,** so an app building its own winston logger can pass the decision in.

The first rule that matches wins:

| Rule | Result |
|------|--------|
| `APP_ENV_LOGGER_COLOR` is set | That value |
| `NO_COLOR` is set and non-empty | Off |
| `NODE_ENV` is `local`, `debug`, `development`, `dev` or `sit` - or unset | On |
| Anything else, including `production`, `staging`, `uat` and unrecognized names | Off |

## Who is affected

- **Anyone running with `NODE_ENV=production`, `staging` or `uat`.** Console lines lose their color. Nothing else about them changes.
- **Anyone running in development.** Nothing changes.
- **Applications on the pino provider.** The rule is a veto only. When it allows color, `pino-pretty` still applies its own terminal detection.
- **File and UDP transports.** Untouched. They never colorized.

## If you want the color back

```bash
APP_ENV_LOGGER_COLOR=true
```

That works in any environment, and it beats `NO_COLOR`. See [Logger reference - Color](/extensions/helpers/logger/reference#color).
