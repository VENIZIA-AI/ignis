---
title: The default timezone in the startup log and the app preset is UTC
description: "APP_ENV_APPLICATION_TIMEZONE falls back to UTC, and the app preset's .env.example sets it to UTC."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-04

## The default timezone in the startup log and the app preset is UTC

<Badge type="tip" text="Enhancement" />

**In one line.** The startup banner prints `Timezone: UTC` when `APP_ENV_APPLICATION_TIMEZONE` is not set, and a new app's `.env.example` sets `UTC`, where both said `Asia/Ho_Chi_Minh`.

## What changed

- **Startup log.** The `Timezone:` line falls back to `UTC`.
- **App preset.** The `.env.example` of an app made with the `ignis` preset sets `APP_ENV_APPLICATION_TIMEZONE=UTC`.
- **Examples and README.** `examples/vert/.env.example` and the `@venizia/ignis-helpers` README sample use `UTC` too.

## Who is affected

- **Apps that do not set the variable.** The log line reads `UTC` now. Nothing else changes: this variable feeds the startup banner and nothing else, and dates take their zone from `TemporalHelper`.
- **Apps that want another zone.** Set `APP_ENV_APPLICATION_TIMEZONE` to it, for example `Asia/Ho_Chi_Minh`.
- **Apps already created from the preset.** No action needed. Their `.env` is theirs.
