---
title: Bundled and Compiled Apps - Helpers Exports Stay Defined, NODE_ENV Stays a Runtime Read, One Logger Provider Across Copies
description: bun build no longer leaves Environment, applicationEnvironment and LoggerFactory undefined; NODE_ENV is read at run time through Environment.ambient; a compiled binary shares one logger provider between its two helpers copies
---

# Changelog - 2026-09-02

## Bundle-safe helpers

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** An IGNIS application built with `bun build` - and a binary built with `bun build --compile` - now starts, reads `NODE_ENV` at run time, and logs through the provider you registered.

## The problem it solves

A bundle of one line, `import { Environment } from '@venizia/ignis-helpers'`, printed `undefined`. Every compiled example crashed at import. Three separate causes, all fixed:

| Cause | Symptom | Fix |
|---|---|---|
| A dynamic `import('./x')` of our own module in the secrets factory | bun wrapped `env`, `logger` and `BaseHelper` in lazy initializers the barrel never ran | Static imports; the optional peers stay behind `ModuleUtility.load` |
| `bun build` folds `process.env.NODE_ENV` into the build machine's value | A binary built on a laptop believed it was in `development` forever | `Environment.ambient`, a read the bundler cannot fold; compile with `--env=disable` |
| A bundle carries helpers twice (your ESM import, core's CJS require) | `LoggerFactory.use()` in your entrypoint was invisible to the framework's copy | The provider lives in one `globalThis` slot shared by both copies |

## What changed

- **`Environment.ambient`** (new): `NODE_ENV` exactly as the process has it, `undefined` when unset. `Environment.current` now derives from it. The error middleware's production check, the request spy and the logger debug gate read it.
- **`LoggerFactory.use({ provider })`** publishes the provider to `globalThis[Symbol.for('ignis:logger-provider')]`; `currentProvider()` reads it before loading the winston default.
- **Secrets factory** imports `HashiCorpVaultHelper` and `DotenvVaultHelper` statically. `node-vault` and `@dotenvx/dotenvx` are still loaded only when a provider is instantiated.
- **Examples** compile with `--minify-whitespace --minify-syntax --env=disable`, register `WinstonLogger` at the entrypoint, and build every binding key from `Class.name`.

## Who is affected

- **Applications that run `tsc` output or source directly.** No behavior change. `Environment.current` returns the same values as before.
- **Applications bundled with `bun build`, with or without `--compile`.** They work now. Add `--env=disable` to your build, register a logger provider at the entrypoint, and replace any literal binding key (`'services.UserService'`) with `BindingKeys.build({ namespace, key: UserService.name })` - see below.
- **Code that read `process.env.NODE_ENV` for a security decision.** Switch to `Environment.ambient`; the dot form is a compile-time constant in a bundle.

## Compiling to a binary

bun renames every decorated class expression it bundles (`UserService` becomes `UserService2`, or `UserService_1` under `--minify-syntax`), and `--keep-names` does not restore it. Keys and log scopes built from `Class.name` stay consistent with each other; a string literal does not match them.

```json
{
  "scripts": {
    "compile:linux": "bun build --compile --minify-whitespace --minify-syntax --sourcemap --env=disable --target=bun-linux-x64 ./src/index.ts --outfile ./dist/app"
  }
}
```

```typescript
// src/index.ts
import { LoggerFactory } from '@venizia/ignis-helpers';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';

LoggerFactory.use({ provider: WinstonLogger });
```

Never `--minify` alone: it minifies identifiers and every class name becomes two letters.

## Details

| Symbol | Change | Package |
|---|---|---|
| `Environment.ambient` | New | `helpers` |
| `Environment.current`, `ApplicationEnvironment.isDevelopment()` | Read through `ambient` | `helpers` |
| `LoggerFactory.use()`, `LoggerFactory.currentProvider()` | Shared `globalThis` slot | `helpers` |
| `createSecretsHelper` | Static provider imports | `helpers` |
| `SHOULD_LOG_DEBUG` | Reads `Environment.ambient` | `helpers` |
| `AppErrorMiddleware`, `RequestSpyMiddleware` | Read `Environment.ambient` | `core-server` |

- Guards: `packages/helpers/src/__tests__/env/bundle-safe-reads.test.ts`, `packages/helpers/src/__tests__/logger/provider-slot.test.ts`.
- Reference: [Logger](/extensions/helpers/logger/reference). Worked example: `examples/vert`.
