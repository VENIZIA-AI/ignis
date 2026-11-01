---
title: One logger factory for the server, a script and a browser
description: 'LoggerFactory is now in @venizia/ignis-helpers/core and defaults to the console, so a compiled binary needs no logger setup and a browser app picks its provider and level with one call; ApplicationLogger, LoggerSlot and LoggerResolver are removed.'
packages: ['@venizia/ignis-helpers', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-01

## One logger factory for the server, a script and a browser

<Badge type="warning" text="Breaking Change" />

**In one line.** `LoggerFactory.getLogger([scope])` is the one way to get a logger everywhere, and `LoggerFactory.use({ provider, level })` chooses the provider and the level, with no setup needed for the console.

## What changed

- **`LoggerFactory` and `ConsoleLogger` are exported from `@venizia/ignis-helpers/core`.** The factory imports nothing from node, so a browser bundle uses it too. The default provider is the console.
- **A compiled binary needs no `LoggerFactory.use`.** `@venizia/ignis` selects Winston at `initialize()` unless your application already chose a provider. If `winston` is not installed, the console stays.
- **`LoggerFactory.use({ provider, level })` chooses the provider and the level.** The level is a `LogLevels` value and applies to every provider the same way.
- **`ApplicationLogger`, `LoggerSlot`, `LoggerResolver`, `ResolvedLogger` and `TLoggerResolver` are removed.** So is the one-time "Logging to the console - no logger provider is installed" warning.

## Who is affected

- **An app that calls `ApplicationLogger`.** Run the codemod: it moves the calls to `LoggerFactory.getLogger([scope])`.
- **Anyone who used `LoggerSlot`, `LoggerResolver` or `TLoggerResolver`, or `LoggerSlot.use` from the `0.4.7-1` prerelease.** Replace the resolver with `LoggerFactory.use({ provider, level })`. A resolver that returned a custom `ILogger` becomes an `ILoggerProvider`: a class with a static `get(scope: string): ILogger`.
- **A script that relied on the console warning, or an app that called `LoggerFactory.use` only so a compiled binary could log.** The warning is gone and the `use` call is optional. Keep it to choose Pino, or to set a level.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Code that imports `ApplicationLogger`, `LoggerSlot`, `LoggerResolver` or `TLoggerResolver` fails to compile or to load after the upgrade.

**Before:**

```typescript
import { ApplicationLogger } from '@venizia/ignis-helpers';
import { ConsoleLogger, LoggerSlot } from '@venizia/ignis-helpers/core';

const logger = ApplicationLogger.get({ scope: 'UserService' });

LoggerSlot.use({
  resolver: ({ scopes }) => quietDebug(ConsoleLogger.get({ scope: scopes.join('-') })),
});
```

**After:**

```typescript
import { LoggerFactory, LogLevels } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['UserService']);

LoggerFactory.use({ level: LogLevels.INFO }); // debug lines are off
```

To upgrade:

1. Run `devz codemod namespace-functions` (dry run), then add `--write`. The logger rewrite is part of it: it moves `ApplicationLogger.get('x')`, `.get(NAME)` and `.get({ scope })` to `LoggerFactory.getLogger([...])` and fixes the import.
2. Replace each `LoggerSlot.use({ resolver })` with `LoggerFactory.use({ provider, level })`. The codemod does not touch it.
3. Run your typecheck after the codemod. An identifier argument is taken for a scope (`ApplicationLogger.get(NAME)` becomes `LoggerFactory.getLogger([NAME])`), so one that held the old `{ scope }` object does not type-check, and a use of `ApplicationLogger` that is not a call (a type, a re-export, a value) is listed with its file and line for you to change.
4. Delete a `LoggerFactory.use` that only existed to keep a compiled binary from failing, unless it picks Pino.

## Details

- **The debug gate.** Every provider shares one rule: `debug` is off unless `DEBUG` is truthy and `NODE_ENV` is unset or an allowed name (`APP_ENV_EXTRA_LOG_ENVS` adds more). Where there is no `process` (a browser) it is off.
- **The level overrides the gate.** `level: LogLevels.DEBUG` turns `debug` on and any higher level turns it off, whatever the environment says.
- **`use` can run late.** Loggers already issued re-point to the new provider on their next line, so call order does not matter.
- **Lines logged before `initialize()` go to the console.** `@venizia/ignis` picks Winston when the application starts (`initialize()`); a line written earlier (in a constructor, or by a test that calls a method directly) uses the console format. Choose the provider with `LoggerFactory.use` before you build the application if those lines must reach Winston's files.
- **A level that is not a `LogLevels` value is ignored.** `LoggerFactory.use({ level })` with a typo or an uppercase name from the environment changes nothing: it never opens debug.
- **The debug gate applies to every provider.** The factory drops `debug` while the gate is closed, so a custom provider needs no gate of its own.
- **`LoggerFactory.useUnlessChosen({ provider })`** chooses a provider only when the application has not. `@venizia/ignis` uses it for Winston. `isChosen()` and `reset()` complete the surface.
- **Two module copies share the choice.** The provider and the level live in `globalThis` slots, so a bundle with two copies of `@venizia/ignis-helpers` sees one provider and one level.
- **A script that imports only helpers** gets the console. Call `LoggerFactory.use({ provider })` with `PinoLogger` or `WinstonLogger` to choose another.

```typescript
import { LoggerFactory, LogLevels } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger, level: LogLevels.INFO });
```

The guide is on the [logger page](/extensions/helpers/logger/#choose-the-provider-and-the-level).
