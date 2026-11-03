---
title: TypeScript 6 Upgrade & Toolchain Refresh
description: The shared compiler config moves to TypeScript 6 and ES2024, adds a lint rule, and the mail component no longer fails at startup when an unused transporter's optional package is missing.
packages: ['@venizia/dev-configs', '@venizia/ignis-inversion']
---

# Changelog - 2026-03-31

## TypeScript 6 Upgrade & Toolchain Refresh

**In one line.** Projects using the shared `@venizia/dev-configs` now compile with TypeScript 6 and an ES2024 target, and the public API is unchanged.

## What changed

- **TypeScript 6.** `typescript` is `^6.0.2` across the packages.
- **ES2024.** The base tsconfig raises `target` and `lib` from `ES2022` to `ES2024` and adds `types: ["bun"]`.
- **Decorators keep working.** `ignoreDeprecations: "6.0"` silences the TypeScript 6 deprecation of `experimentalDecorators`; IGNIS still relies on `experimentalDecorators` and `emitDecoratorMetadata` for its metadata system.
- **Leaner base config.** `esModuleInterop`, `allowSyntheticDefaultImports` and `downlevelIteration` are removed as redundant.
- **New lint rule.** `no-useless-assignment` is enabled in the shared ESLint config and flags assignments whose value is never read.
- **Mail fix.** The mailgun and nodemailer transporters no longer check for their optional package in `configure()`, which threw at startup even when that transporter was never used.
- **Redis and BullMQ typing.** A connection-type mismatch is corrected, and the missing redis peer entries are added to `package.json`.

## Who is affected

- **Projects extending the shared `@venizia/dev-configs` tsconfig.** You pick up TypeScript 6 and ES2024 automatically on upgrade.
- **Projects that pin TypeScript themselves.** Move to `^6.0.2`.
- **Mail component users.** You no longer need every transporter's optional dependency installed.
