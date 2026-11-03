---
title: Artifacts Register From a Generated Index, and the Runtime Boot System Is Retired
description: Decorate a class, generate one index at build time and pass it in the config, so application.ts lists nothing; Bootstrapper, booters and boot() are gone.
packages: ['@venizia/ignis-boot', '@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-02

## Decorator-driven artifact registration

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A class says what it is with a decorator, a build-time generator lists every such class in one file, and the application registers that file, so `application.ts` stops naming controllers, services, repositories, datasources and components one by one.

## What changed

- **Stereotypes.** `@injectable({ type })` is the root; `@service()` and `@component()` are new; `@controller`, `@repository`, `@datasource` and `@model` record the same metadata. All accept `binding`, `allowOverride`, `scope`, `order` and `when` (a sync or async condition).
- **`@provide({ key, scope? })`.** A component method becomes the lazy provider of a binding key, instead of `this.bind(...).toValue(...)` before `this.component(...)`.
- **`configs.artifacts`.** Registers datasources, components, repositories, services and controllers in that order, honours `when` and `order`, and binds `@provide` keys. Indexes compose: `artifacts: [LibraryArtifacts, GeneratedArtifacts]`.
- **`ignis-artifacts` CLI.** `@venizia/ignis-boot` is now a build-time generator: `generate` writes `src/generated/artifacts.ts`, and `check` fails lint when it is stale. Also available as `generateArtifactIndex` and `checkArtifactIndex` from `@venizia/ignis-boot/generator`.
- **Compiled binaries work.** The generated index is plain imports a bundler sees, unlike the removed runtime boot system, which globbed the file system.
- **`controller()` binds `SINGLETON`.** A second resolution returns the same instance.
- **Boot sequence.** Step names are const classes (`BootSteps`, `ServerBootSteps`), each step logs `Boot step n/14 <name>`, and `BootSequence.insertAfter` refuses an unknown or ambiguous target.

```typescript
@service()
export class PricingService extends BaseService {}

export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: [GeneratedArtifacts, { components: [HealthCheckComponent] }],
};
```

## Who is affected

- **Apps that register by hand in `preConfigure()`.** Nothing breaks; the six methods keep working and read decorator defaults. Migrate when convenient - see the [guide](/guides/core-concepts/application/bootstrapping).
- **Apps that call `application.boot()`.** It compiles and warns once, and does nothing. Replace the chain with one `await application.start()`.
- **Apps with `bootOptions` or an `override boot()`.** Both still type-check and are ignored. Delete them.
- **Apps that call `this.booter()` or `registerBooters()`, or import `Bootstrapper`, a booter class or `BootMixin`.** These are removed. Action required, below.
- **Apps that passed `TMixinOpts.args`.** Removed; no framework method read it.
- **Code that relied on a fresh controller instance per `get`.** `controller()` is `SINGLETON` now.

## Breaking changes

> [!WARNING]
> The runtime boot system is gone. Anything that imported it from `@venizia/ignis-boot` or called `booter()` no longer compiles.

**Before:**

```typescript
// index.ts
application.boot().then(() => application.start());

// application.ts
export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  bootOptions: { controllers: { dirs: ['controllers'] }, services: { dirs: ['services'] } },
};

export class Application extends BaseApplication {
  preConfigure() {
    this.booter(CustomBooter);
    this.bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue({ restOptions: { path: '/health' } });
    this.component(HealthCheckComponent);
    this.service(PricingService);
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
  artifacts: [GeneratedArtifacts, { components: [HealthCheckComponent] }],
};

// components/platform.component.ts
@component()
export class PlatformComponent extends BaseComponent {
  @provide({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
  healthCheckOptions(): IHealthCheckOptions {
    return { restOptions: { path: '/health' } };
  }
}
```

Migration:

1. Add `@venizia/ignis-boot` as a devDependency; add `generate:artifacts` and `check:artifacts` scripts.
2. Put `@service()` on services and `@component()` on components.
3. Run `bun run generate:artifacts`, commit `src/generated/artifacts.ts`, and wire `check:artifacts` into lint.
4. Set `configs.artifacts`; delete the registration calls, `bootOptions`, `override boot()` and the `.boot()` chain.
5. Move option bindings into `@provide` methods; keep registry calls (`AuthenticationStrategyRegistry`, `AuthorizationEnforcerRegistry`) in `preConfigure()` or `postConfigure()`.

Removed: `BaseApplication.booter()`, `registerBooters()`, `Bootstrapper`, `BaseArtifactBooter`, the four booters, `BootMixin`, `discoverFiles`, `loadClasses`, `isClass`, `TMixinOpts.args`. `BaseApplication.boot()` is a deprecated no-op.

## Details

- Reference: [Artifact Registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping).
