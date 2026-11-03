---
title: The Deprecated Runtime Boot API Is Fully Removed
description: boot(), bootOptions, IBootReport, IBootableApplication and BindingNamespaces.BOOTERS are removed from @venizia/ignis and @venizia/ignis-boot, so code that still uses them now fails to compile.
packages: ['@venizia/ignis-boot', '@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-03

## Deprecated boot API removed

<Badge type="warning" text="Breaking Change" />

**In one line.** The deprecated runtime boot shims - `boot()`, `bootOptions`, `IBootReport`, `IBootableApplication`, `BindingNamespaces.BOOTERS` - are gone, so a leftover call is now a compile error instead of a silent no-op.

## What changed

- **`BaseApplication.boot()` is removed.** Call `application.start()` alone. `BaseApplication` no longer implements `IBootableApplication`.
- **`IApplicationConfigs.bootOptions` is removed**, along with the kernel's `IApplicationBootOptions` and `IApplicationArtifactOptions`.
- **`@venizia/ignis-boot` no longer exports** `IBootOptions`, `IArtifactOptions`, `IBootReport`, `IBootPhaseReport`, `TBootPhase`, `BootPhases` or `IBootableApplication`. The package now exports only the build-time artifact index generator.
- **`BindingNamespaces.BOOTERS` is removed.**
- **The empty `BaseCrudService` placeholder is removed** from `@venizia/ignis-kernel`.
- **Bug fix.** `ArtifactScanner.scan()`'s `ignore` option now merges with `DEFAULT_IGNORE` instead of replacing it.

## Who is affected

- **Apps that call `await application.boot()`.** Delete the line; `initialize()` and `start()` are unchanged.
- **Configs that set `bootOptions`.** Delete the key; it has been ignored since 2026-09-02.
- **Classes that `implements IBootableApplication` or `override boot()`.** Delete both. Delete the whole method, not just the `override` keyword: an `override` with no base method is `TS4113`.
- **Apps already on `configs.artifacts`.** No action needed. If you have not migrated, see the [2026-09-02 changelog](./2026-09-02-decorator-artifact-registration).
- **Upgrading an app.** Follow the [migration guide](/guides/migrations/boot-api-removal-migration); it lists every file and the order to fix them.

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

1. Delete every `await application.boot();` call; `start()` already runs the full sequence.
2. Delete `bootOptions` from the config, and any `override boot()` or `implements IBootableApplication`.
3. If you have not already, set `configs.artifacts` to a generated index - see [Registering artifacts](/guides/core-concepts/application/bootstrapping).

## Details

- The `ignore` merge fix has no effect unless you pass `--ignore` to the scanner.
- Reference: [Artifact Registration](/references/base/bootstrapping).
