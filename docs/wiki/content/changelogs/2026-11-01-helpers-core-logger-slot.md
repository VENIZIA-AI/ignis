---
title: Install your own logger in a browser app
description: '@venizia/ignis-helpers/core now exports LoggerSlot and ConsoleLogger, so a browser app can choose the logger every helper writes to, and silence debug lines in production.'
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-01

## Install your own logger in a browser app

<Badge type="tip" text="New Feature" />

**In one line.** A browser app can now decide which logger its helpers write to, for example to keep debug lines out of production.

## What changed

- **`LoggerSlot.use({ resolver })`** installs the logger every helper (`BaseHelper` and everything built on it) writes to. The resolver receives the helper's `scopes` and returns an `ILogger`.
- **`LoggerSlot`, `ConsoleLogger` and the `TLoggerResolver` type are exported from `@venizia/ignis-helpers/core`.** The `core` entry stays browser-pure; an app that does not import them pays nothing.

## Who is affected

- **A browser app that wants its own log level or sink.** Install a resolver once at startup, before the first log line. Before this, the only choice was `console.debug` for every debug line.
- **Everyone else.** No action needed.

## Details

Without a resolver, a helper writes to the console as before (under Node it prints one warning that no provider is installed). `LoggerFactory` stays node-only.

```typescript
import { ConsoleLogger, LoggerSlot } from '@venizia/ignis-helpers/core';

LoggerSlot.use({
  resolver: ({ scopes }) => quietDebug(ConsoleLogger.get({ scope: scopes.join('-') })),
});
```

Install the resolver before the first log line: the logger a helper resolved on its first line is the one it keeps. The guide is on the [logger page](/extensions/helpers/logger/#choose-the-logger-in-a-browser-app).
