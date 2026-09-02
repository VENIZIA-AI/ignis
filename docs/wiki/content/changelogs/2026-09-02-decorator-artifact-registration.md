---
title: Artifacts Register From a Generated Index, and the Runtime Boot System Is Retired
description: Decorate a class, generate one index at build time, pass it in the config - application.ts lists nothing; Bootstrapper, booters and boot() are gone
---

# Changelog - 2026-09-02

## Decorator-driven artifact registration

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A class says what it is with a decorator, a build-time generator lists every such class in one file, and the application registers that file - so `application.ts` stops naming controllers, services, repositories, datasources and components one by one.

## The problem it solves

Registration by hand grows with the codebase: one production `application.ts` reached 286 lines and 99 `this.controller(...)`-style calls, and every forgotten call was a runtime 404. The runtime boot system that was meant to replace it globbed the file system, which a compiled binary (`bun build --compile`) cannot do. The generated index is plain imports the bundler sees.

```typescript
@service()
export class PricingService extends BaseService {}

export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: [GeneratedArtifacts, { components: [HealthCheckComponent] }],
};
```

## What changed

- **Stereotypes.** `@injectable({ type })` is the root; `@service()` and `@component()` are new; `@controller`, `@repository`, `@datasource`, `@model` now record the same metadata. All accept `binding`, `allowOverride`, `scope`, `order` and `when` (a sync or async condition).
- **`@provide({ key, scope? })`.** A component method becomes the lazy provider of a binding key - the place for the options a framework component reads, instead of `this.bind(...).toValue(...)` before `this.component(...)`.
- **`configs.artifacts` and a boot step.** `registerArtifacts` runs between `staticConfigure` and `preConfigure`, registers datasources, components, repositories, services, controllers in that order, honours `when` and `order`, and binds `@provide` keys. Indexes compose: `artifacts: [LibraryArtifacts, GeneratedArtifacts]`.
- **`ignis-artifacts` CLI.** `@venizia/ignis-boot` is now a build-time generator over the TypeScript AST: `generate` writes `src/generated/artifacts.ts`, `check` fails lint when it is stale. Also available as `generateArtifactIndex` / `checkArtifactIndex` from `@venizia/ignis-boot/generator`.
- **`controller()` binds `SINGLETON`.** The REST component mounts the one instance it resolves; a second resolution now returns that instance.
- **Boot sequence as data.** Step names are const classes (`BootSteps`, `ServerBootSteps`), each step logs `Boot step n/14 <name>`, and `BootSequence.insertAfter` refuses an unknown or ambiguous target.
- **`@venizia/ignis-inversion` no longer ships compiled tests** in `dist`; `bun test` reports 38 tests instead of three times that.

## Who is affected

- **Applications that register by hand in `preConfigure()`.** Nothing breaks; the six methods keep working and now read decorator defaults. Migrate when convenient - see the [guide](/guides/core-concepts/application/bootstrapping).
- **Applications that call `application.boot()` in `index.ts`.** It compiles and warns once; the call does nothing. Replace the chain with one `await application.start()`.
- **Applications with `bootOptions` in the config or an `override boot()`.** Both still type-check and are ignored. Delete them.
- **Applications that call `this.booter()`, `registerBooters()`, or import `Bootstrapper`, a booter class or `BootMixin`.** These are removed - action required, below.
- **Applications that passed `TMixinOpts.args`.** Removed; no framework method ever read it.
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
3. Run `bun run generate:artifacts`, commit `src/generated/artifacts.ts`, wire `check:artifacts` into lint.
4. Set `configs.artifacts`; delete the registration calls, `bootOptions`, `override boot()` and the `.boot()` chain.
5. Move option bindings into `@provide` methods; keep registry calls (`AuthenticationStrategyRegistry`, `AuthorizationEnforcerRegistry`) in `preConfigure()` / `postConfigure()`.

## Details

| Symbol | Change | Package |
|---|---|---|
| `injectable`, `service`, `component`, `provide`, `pickRegistrationOptions` | New | `kernel` |
| `ArtifactTypes`, `IArtifactRegistrationOptions`, `IArtifactMetadata`, `IProvideMetadata`, `TArtifactCondition` | New | `kernel` |
| `IArtifactIndex`, `TArtifactIndexInput`, `IApplicationConfigs.artifacts` | New | `kernel` |
| `RestApplication.registerArtifacts()`, `registerConfiguredArtifacts()`, `BootSteps.REGISTER_ARTIFACTS` | New | `kernel` |
| `ServerBootSteps` | New | `core-server` |
| `BaseApplication.boot()` | Deprecated no-op | `core-server` |
| `BaseApplication.booter()`, `registerBooters()` | Removed | `core-server` |
| `Bootstrapper`, `BaseArtifactBooter`, the four booters, `BootMixin`, `discoverFiles`, `loadClasses`, `isClass` | Removed | `boot` |
| `ignis-artifacts`, `generateArtifactIndex`, `checkArtifactIndex`, `ArtifactScanner`, `ArtifactIndexEmitter` | New | `boot` |
| `TMixinOpts.args` | Removed | `kernel` |

- Reference: [Artifact Registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping). Worked example: `examples/vert`.
