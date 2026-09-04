---
title: The Deprecated Runtime Boot API Is Fully Removed
description: boot(), bootOptions, IBootReport, IBootableApplication and BindingNamespaces.BOOTERS are gone from @venizia/ignis and @venizia/ignis-boot
---

# Changelog - 2026-09-03

## Deprecated boot API removed

<Badge type="warning" text="Breaking Change" />

**In one line.** The deprecated runtime boot shims - `boot()`, `bootOptions`, `IBootReport`, `IBootableApplication`, `BindingNamespaces.BOOTERS` - are gone; nothing in the framework calls or exports them anymore.

## The problem it solves

`boot()` became a no-op on 2026-09-02: every call still compiled and warned once, but did nothing. A shim that never fails hides the exact moment a caller should have switched to `configs.artifacts`. Removing it turns that silent no-op into a compile error, which is the point where a caller actually notices.

```typescript
// Compiled and warned once, but did nothing, since 2026-09-02
await application.boot();
await application.start();
```

## What changed

- **`BaseApplication.boot()` is removed**, along with the private `hasWarnedBootDeprecated` flag it used to warn once per process. Call `application.start()` alone.
- **`BaseApplication` no longer implements `IBootableApplication`** - only `IRestApplication`.
- **`IApplicationConfigs.bootOptions` is removed**, in `@venizia/ignis` and in the kernel's structural mirror (`IApplicationBootOptions`, `IApplicationArtifactOptions`).
- **`@venizia/ignis-boot` no longer exports** `IBootOptions`, `IArtifactOptions`, `IBootReport`, `IBootPhaseReport`, `TBootPhase`, `BootPhases` or `IBootableApplication`. `packages/boot/src/common/` is deleted; the package now exports only the build-time artifact index generator.
- **`BindingNamespaces.BOOTERS` is removed** - nothing has written to it since the runtime booters left on 2026-09-02.
- **The dead `BaseCrudService` placeholder is removed** from `@venizia/ignis-kernel` (`base/services/base-crud.ts` was an empty `export {}` left over from an earlier rename).

## Who is affected

- **Applications that call `await application.boot()`.** Delete the line - `initialize()` and `start()` are unchanged.
- **Configs that set `bootOptions`.** Delete the key; it has been ignored since 2026-09-02.
- **Classes that `implements IBootableApplication` or `override boot()`.** Delete both - the interface and the base method no longer exist.
- **Everyone already on `configs.artifacts`.** No action needed - see the [2026-09-02 changelog](./2026-09-02-decorator-artifact-registration) if you have not migrated yet.
- **Upgrading nx-seller?** Follow the [migration guide](/guides/migrations/boot-api-removal-migration) - it lists every file and the order to fix them.
- **Known internal call sites and overrides, for coordination (21 across BANA/nx-seller).** Every
  row fails to compile until it's deleted. 3 call `.boot()`, 2 set `bootOptions`, and 16 declare
  `override async boot()` - none of the 16 calls `super.boot()` and every one returns the literal
  empty report, so the fix is to delete the whole method, not just the `override` keyword (keeping
  an `override` with no base method to override is `TS4113`):

  | File | Line | Site |
  |---|---|---|
  | `packages/search/src/migrations/bootstrap.ts` | 104 | `await app.boot();` |
  | `packages/core/src/helpers/bootstraps/migration.ts` | 31 | `await application.boot();` |
  | `packages/core/src/helpers/bootstraps/worker.ts` | 34 | `await application.boot();` |
  | `packages/core/src/helpers/bootstraps/migration.ts` | 25 | `bootOptions: {}` |
  | `packages/core/src/common/app-config.ts` | 15 | `bootOptions: {` |
  | `packages/search/src/migrations/bootstrap.ts` | 61 | `override async boot()` |
  | `packages/commerce/src/application.ts` | 169 | `override async boot()` |
  | `packages/finance/src/application.ts` | 47 | `override async boot()` |
  | `packages/helpdesk/src/application.ts` | 204 | `override async boot()` |
  | `packages/identity/src/application.ts` | 99 | `override async boot()` |
  | `packages/inventory/src/application.ts` | 121 | `override async boot()` |
  | `packages/invoice/src/application.ts` | 113 | `override async boot()` |
  | `packages/ledger/src/application.ts` | 83 | `override async boot()` |
  | `packages/licensing/src/application.ts` | 36 | `override async boot()` |
  | `packages/outreach/src/application.ts` | 20 | `override async boot()` |
  | `packages/payment/src/application.ts` | 24 | `override async boot()` |
  | `packages/pricing/src/application.ts` | 66 | `override async boot()` |
  | `packages/sale/src/application.ts` | 158 | `override async boot()` |
  | `packages/search/src/application.ts` | 68 | `override async boot()` |
  | `packages/signal/src/application.ts` | 24 | `override async boot()` |
  | `packages/taxation/src/application.ts` | 76 | `override async boot()` |

## Breaking changes

> [!WARNING]
> Anything that still calls `boot()`, reads `bootOptions`, or imports `IBootReport`, `IBootableApplication`, `IArtifactOptions` or `IBootOptions` from `@venizia/ignis-boot` no longer compiles.

**Before:**

```typescript
// index.ts
await application.boot();
await application.start();

// application.ts
export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  bootOptions: {},
};

export class Application extends BaseApplication implements IBootableApplication {
  override async boot() {
    return super.boot();
  }
}
```

**After:**

```typescript
// index.ts
await application.start();

// application.ts
export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: GeneratedArtifacts,
};

export class Application extends BaseApplication {}
```

Migration:

1. Delete every `await application.boot();` call - `start()` already runs the full sequence.
2. Delete `bootOptions` from the config, and any `override boot()` or `implements IBootableApplication`.
3. If you have not already, set `configs.artifacts` to a generated index - see [Registering artifacts](/guides/core-concepts/application/bootstrapping).

## Details

| Symbol | Change | Package |
|---|---|---|
| `BaseApplication.boot()`, `hasWarnedBootDeprecated` | Removed | core-server |
| `BaseApplication implements IBootableApplication` | Removed | core-server |
| `IBootOptions`, `IArtifactOptions`, `IBootReport`, `IBootPhaseReport`, `TBootPhase`, `BootPhases`, `IBootableApplication` | Removed | boot |
| `IApplicationConfigs.bootOptions` | Removed | kernel |
| `IApplicationBootOptions`, `IApplicationArtifactOptions` (kernel mirror) | Removed | kernel |
| `BindingNamespaces.BOOTERS` | Removed | kernel |
| `base/services/base-crud.ts` (dead `BaseCrudService` placeholder) | Removed | kernel |
| `ArtifactScanner.scan()`'s `ignore` option | Fixed - now merges with `DEFAULT_IGNORE` instead of replacing it | boot |

`ArtifactScanner.scan()`'s `ignore` option merging instead of replacing was a latent bug caught while
touching this file - nobody passes `--ignore` today, in this repo or in BANA, so its blast radius is
zero.

- Reference: [Artifact Registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping). Prior migration: [2026-09-02 changelog](./2026-09-02-decorator-artifact-registration).
