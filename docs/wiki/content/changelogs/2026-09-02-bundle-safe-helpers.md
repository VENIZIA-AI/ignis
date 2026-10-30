---
title: Bundled and Compiled Apps - Helpers Exports Stay Defined, NODE_ENV Stays a Runtime Read, One Logger Provider Across Copies
description: An IGNIS app built with bun build or bun build --compile now starts, reads NODE_ENV at run time through Environment.ambient, and logs through the provider you registered.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-02

## Bundle-safe helpers

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** An IGNIS application built with `bun build`, or a binary built with `bun build --compile`, now starts, reads `NODE_ENV` at run time, and logs through the provider you registered.

## What changed

- **Imports no longer come back `undefined`.** `Environment`, `applicationEnvironment` and `LoggerFactory` from `@venizia/ignis-helpers` are defined in a bundle. Compiled examples no longer crash at import.
- **`Environment.ambient` (new).** `NODE_ENV` exactly as the process has it, `undefined` when unset. A bundler cannot fold it to the build machine's value. `Environment.current` now derives from it, as do the error middleware's production check, the request spy and the logger debug gate.
- **One logger provider across copies.** `LoggerFactory.use({ provider })` is now seen by every copy of helpers in the bundle, including the framework's own.
- **Secrets providers.** `HashiCorpVaultHelper` and `DotenvVaultHelper` are imported statically. `node-vault` and `@dotenvx/dotenvx` are still loaded only when a provider is instantiated.

## Who is affected

- **Apps that run `tsc` output or source directly.** No change. `Environment.current` returns the same values.
- **Apps bundled with `bun build`, with or without `--compile`.** They work now. Add `--env=disable` to your build, register a logger provider at the entrypoint, and replace literal binding keys (`'services.UserService'`) with `BindingKeys.build({ namespace, key: UserService.name })`.
- **Code that reads `process.env.NODE_ENV` for a security decision.** Switch to `Environment.ambient`; the dot form is a compile-time constant in a bundle.

## Details

bun renames every decorated class it bundles (`UserService` becomes `UserService2`, or `UserService_1` under `--minify-syntax`), and `--keep-names` does not restore it. Keys and log scopes built from `Class.name` stay consistent with each other; a string literal does not match them. Never use `--minify` alone: it turns every class name into two letters.

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

Reference: [Logger](/extensions/helpers/logger/reference).
