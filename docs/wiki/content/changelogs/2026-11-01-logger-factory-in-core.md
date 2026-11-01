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

- **Import `LoggerFactory` and `ConsoleLogger` from `@venizia/ignis-helpers/core`.** The factory imports nothing from node. Browser bundles can use it directly. The default provider is the console.
- **Omit `LoggerFactory.use` in compiled binaries.** `@venizia/ignis` automatically selects Winston during `initialize()`. It skips this selection if your app already picked a provider. The console remains active if `winston` is not installed.
- **Call `LoggerFactory.use({ provider, level })` to set the provider and the level.** Use a `LogLevels` value for the level. The level applies to every provider in the same way.
- **Check `LoggerDebugGate.isOpen()` instead of `SHOULD_LOG_DEBUG`.** `SHOULD_LOG_DEBUG` is removed. It only recorded a snapshot when the module loaded. Loggers now check the live gate directly. You can update that live gate with `LoggerFactory.use({ level })`. Nothing inside IGNIS read the old constant.
- **Stop using removed symbols.** The update removes `ApplicationLogger`, `LoggerSlot`, `LoggerResolver`, `ResolvedLogger` and `TLoggerResolver`. It also removes the warning about logging to the console with no provider installed.

## Who is affected

- **Apps that call `ApplicationLogger`.** Run the codemod. It converts those calls to `LoggerFactory.getLogger([scope])`.
- **Apps that use `LoggerSlot`, `LoggerResolver`, `TLoggerResolver`, or `LoggerSlot.use` from prerelease `0.4.7-1`.** Replace the resolver by calling `LoggerFactory.use({ provider, level })`. Convert any resolver that returned a custom `ILogger` into an `ILoggerProvider`. Make it a class with a static `get(scope: string): ILogger` method.
- **Scripts relying on the console warning, or apps calling `LoggerFactory.use` only for compiled binaries.** The warning is gone. The `use` call is now optional. Keep the call only if you want Pino or need to set a specific level.
- **Everyone else.** Do nothing.

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

- **Know the debug gate rules.** Every provider shares the same rule. Debug is off by default. It turns on only when `DEBUG` is truthy and `NODE_ENV` is unset or set to an allowed name. You can add allowed names with `APP_ENV_EXTRA_LOG_ENVS`. Environments without `process`, such as a browser, keep debug off.
- **Override the gate with a level.** Set `level: LogLevels.DEBUG` to force debug on. Set any higher level to force debug off. The level setting overrides the environment variables.
- **Call `use` at any time.** Existing loggers switch to the new provider on their next log line. Call order does not matter.
- **Expect console format before `initialize()`.** `@venizia/ignis` selects Winston when `initialize()` runs. Any line logged earlier uses console format. This includes lines logged in constructors or direct test calls. Call `LoggerFactory.use` before building the app if those early lines must go to Winston files.
- **Pass valid `LogLevels` values.** The factory ignores any value outside `LogLevels`. Typos or uppercase strings from environment variables change nothing. Invalid values never enable debug logging.
- **Write custom providers without custom debug gates.** The factory filters out `debug` messages while the gate is closed. Custom providers do not need their own gate logic.
- **Use helper methods when needed.** Call `LoggerFactory.useUnlessChosen({ provider })` to set a fallback provider. `@venizia/ignis` uses this method for Winston. You can also inspect or clear state with `isChosen()` and `reset()`.
- **Rely on shared state across duplicate bundles.** The chosen provider and level live in `globalThis` slots. Two copies of `@venizia/ignis-helpers` in the same bundle share the same configuration.
- **Configure scripts that import only helpers.** These scripts default to the console. Call `LoggerFactory.use({ provider })` with `PinoLogger` or `WinstonLogger` if you need another provider.

```typescript
import { LoggerFactory, LogLevels } from '@venizia/ignis-helpers';
import { PinoLogger } from '@venizia/ignis-helpers/pino';

LoggerFactory.use({ provider: PinoLogger, level: LogLevels.INFO });
```

The guide is on the [logger page](/extensions/helpers/logger/#choose-the-provider-and-the-level).
