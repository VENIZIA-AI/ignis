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
- **Known internal call sites, for coordination.** Each one now fails to compile until it is deleted:

  | File | Line | What breaks |
  |---|---|---|
  | `packages/search/src/migrations/bootstrap.ts` | 104 | `await app.boot();` |
  | `packages/core/src/helpers/bootstraps/migration.ts` | 31 | `await application.boot();` |
  | `packages/core/src/helpers/bootstraps/worker.ts` | 34 | `await application.boot();` |
  | `packages/core/src/helpers/bootstraps/migration.ts` | 25 | `bootOptions: {}` |
  | `packages/core/src/common/app-config.ts` | 15 | `bootOptions: {` |

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

- Reference: [Artifact Registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping). Prior migration: [2026-09-02 changelog](./2026-09-02-decorator-artifact-registration).
