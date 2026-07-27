---
title: TypeScript 6 Upgrade & Toolchain Refresh
description: Upgrade to TypeScript 6, ES2024 target, refreshed ESLint rules, and small helper fixes across all packages
---

# Changelog - 2026-03-31

## TypeScript 6 Upgrade & Toolchain Refresh

The whole monorepo moves to **TypeScript 6** with an **ES2024** target, plus refreshed shared compiler and lint configs. It also carries a few small correctness fixes in the mail and redis helpers. These are maintenance changes - the framework's public API is unchanged.

## Overview

- **TypeScript 6**: `typescript` bumped to `^6.0.2` across every package
- **ES2024 target**: `target`/`lib` raised from `ES2022` to `ES2024`; `types: ["bun"]` added to the base config
- **Decorator deprecations silenced**: `ignoreDeprecations: "6.0"` keeps `experimentalDecorators` working under TS6
- **Leaner base tsconfig**: dropped now-redundant `esModuleInterop`, `allowSyntheticDefaultImports`, and `downlevelIteration`
- **New ESLint rule**: `no-useless-assignment` enabled via `@venizia/dev-configs`
- **Shared config releases**: `@venizia/dev-configs@0.0.7-x`, `@venizia/ignis-inversion@0.0.6-x`
- **Helper fixes**: mail transporter `validateModule` removed; redis/BullMQ connection typing corrected

## Toolchain Changes

### TypeScript 6 + ES2024

**File:** `packages/dev-configs/tsconfig/tsconfig.base.json`

**Before:**
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "downlevelIteration": true
  }
}
```

**After:**
```jsonc
{
  "compilerOptions": {
    /* TypeScript 6.0 - suppress deprecation warnings for experimentalDecorators */
    "ignoreDeprecations": "6.0",
    "target": "ES2024",
    "lib": ["ES2024"],
    "types": ["bun"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

> [!NOTE]
> TypeScript 6 deprecates `experimentalDecorators` in favor of standard decorators, but IGNIS still relies on `experimentalDecorators` + `emitDecoratorMetadata` for its DI/metadata system. `ignoreDeprecations: "6.0"` keeps the legacy decorator semantics until a future migration.

### `no-useless-assignment` ESLint rule

The shared ESLint config now flags assignments whose value is never read before being overwritten. A handful of internal files (`controller.ts`, `app-error.middleware.ts`, `docs.helper.ts`) were cleaned up to satisfy it. One example: it removed the unused binding in the Zod-error `catch` block.

## Bug Fixes

### Mail transporters: removed `validateModule` gate

**File:** `packages/core/src/components/mail/helpers/transporters/{mailgun,nodemail}-transporter.helper.ts`

The transporters previously called `validateModule({ modules: ['mailgun.js'] })` (and the nodemailer equivalent) inside `configure()`. This threw at startup when the optional peer wasn't installed, even if that transporter was never used. The eager check was removed so the mail component loads without forcing every transporter's optional dependency.

### Redis / BullMQ connection typing

**File:** `packages/helpers/src/modules/redis/default.helper.ts`, `packages/helpers/src/modules/queue/bullmq/helper.ts`

Corrected a connection-type mismatch that broke the helpers build, and added the missing redis peer entries to `package.json`.

## Files Changed

### Dev Configs (`packages/dev-configs`)

| File | Changes |
|------|---------|
| `tsconfig/tsconfig.base.json` | ES2024 target/lib, `types: ["bun"]`, `ignoreDeprecations: "6.0"`, removed redundant interop/iteration options |
| `tsconfig/tsconfig.common.json` | Aligned with TS6 |
| `package.json` | `typescript@^6.0.2`, `no-useless-assignment` rule, release `0.0.7-x` |

### All Packages

| File | Changes |
|------|---------|
| `packages/*/package.json` | `typescript` bumped to `^6.0.2` |
| `packages/*/tsconfig*.json` | Inherit ES2024 base config |
| `packages/core/src/components/mail/helpers/transporters/*` | Removed `validateModule` startup gate |
| `packages/helpers/src/modules/redis/default.helper.ts` | Fixed redis connection type |
| `packages/helpers/src/modules/queue/bullmq/helper.ts` | Fixed BullMQ connection type |

## No Breaking Changes

No public API changed. Consumers compiling with the shared `@venizia/dev-configs` automatically pick up TS6 and the ES2024 target on upgrade. If you pin TypeScript yourself, move to `^6.0.2`.
