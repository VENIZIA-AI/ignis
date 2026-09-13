---
type: Architecture
title: Component model
description: What an IGNIS component is, how it declares its bindings, and where it runs in the application lifecycle.
resource: packages/kernel/src/base/components
tags: [architecture, components, lifecycle, di]
---

A component is IGNIS's unit of pluggable capability: a class that owns a set of default bindings and
one `binding()` method that wires itself into the application. Health checks, the API reference UI,
authentication, mail, static assets and Socket.IO are all components.

The base class and most components live in different packages. `BaseComponent` is browser-pure and
ships from `@venizia/ignis-kernel` (`packages/kernel/src/base/components/base.ts`), and so does
`RestComponent` (`packages/kernel/src/base/components/controller/rest/rest.component.ts`) - REST
controller registration belongs to `RestApplication` by inheritance now, and core re-exports the
kernel barrel, so `RestComponent` is still reachable from `@venizia/ignis`. Every other concrete
component - health check, api-reference, request-tracker, auth, mail, socket-io, static-asset,
websocket, and the gRPC controller component under `controller/grpc/` - stays in
`packages/core-server/src/components/`. So a component class is usually written in core and imports
its base from the kernel.

`BaseComponent extends BaseHelper implements IConfigurable` is small on purpose:

```typescript
export abstract class BaseComponent<ConfigurableOptions extends object = {}> {
  protected bindings: Record<TBindingKey, Binding>;
  protected initDefault: TInitDefault;   // { enable: false } | { enable: true; container }
  protected isConfigured = false;
  abstract binding(): ValueOrPromise<void>;
  async configure(opts?: ConfigurableOptions): Promise<void>;
}
```

`configure()` is the template method and it is **idempotent** - it returns immediately if
`isConfigured` is already true, so a component configured twice (once by the lifecycle scan, once by
hand) is harmless. It installs the default bindings (when `initDefault.enable`), awaits the
subclass's `binding()`, then marks itself configured.

`initDefaultBindings` never overwrites: for each declared binding it checks `container.isBound({ key })`
and skips it if so. So an application overrides a component's options simply by binding that options
key **before** the component configures.

That is one of two paths. `application.component(Ctor, { options })` stores `options` in the
application's private `artifactOptions` map, keyed by binding key; the boot-time registration sweep
reads it back and passes it to `configure(options)`. A component opts into that path by **overriding
`configure()`** - nothing in the base class consumes the argument on its own.

## A real component

```typescript
export class HealthCheckComponent extends BaseComponent<IHealthCheckOptions> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: HealthCheckComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS]: Binding
          .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
          .toValue(DEFAULT_OPTIONS),
      },
    });
  }

  // `application.component(HealthCheckComponent, { options })` lands here.
  override async configure(opts?: IHealthCheckOptions): Promise<void> {
    if (this.isConfigured) {
      return;
    }

    if (opts !== undefined) {
      this.application
        .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
        .toValue(opts);
    }

    await super.configure(opts);
  }

  override async binding(): Promise<void> {
    const healthOptions = this.application.get<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      isOptional: true,
    });
    Reflect.decorate(
      [controller({ path: healthOptions?.restOptions?.path ?? DEFAULT_REST_PATH })],
      HealthCheckController,
    );
    this.application.controller(HealthCheckController);
  }
}
```

Three things generalize. The `configure()` override is how call-site options reach a component:
they are the most explicit statement of intent, so it binds them over anything bound earlier, and
`initDefaultBindings` then finds the key taken and leaves the default aside. It repeats the
`isConfigured` guard itself because the base's guard runs too late - binding after it would swap the
options under routes already mounted from the first call. The options are read back in `binding()`
with `isOptional: true` and defaulted again - a partially filled options binding (env or config
driven) must not take the app down at boot. And the component reaches the application through
`@inject({ key: CoreBindings.APPLICATION_INSTANCE })`, using the application's own registration
helpers rather than binding by hand.

`RequestTrackerComponent` is the middleware variant: it declares its middleware under a
`middlewares.*` key with `toProvider(...)` at singleton scope, then in `binding()` pulls it back out
of the container and installs it with `server.use(mw)`.

## How components get run

`application.component(Ctor)` binds the class under `components.<ClassName>` at **singleton** scope.
The namespace auto-tagging in `Binding` tags it `components`, and `registerComponents()` scans that
tag, resolves each binding, and awaits `configure()`.

That scan re-runs excluding what it already configured, so **a component may register more
components**, at any nesting depth. A component may also **add a datasource of its own** - kernel's
`RestApplication` catches that with `registerContributedDataSources()`, a second, flat
`registerDataSources()` sweep run as its own step right after `registerComponents()` in
`getBootSequence()`, rather than re-scanning after every single component.

Two consequences follow from the sweeps being separate, sequential steps rather than one interleaved
loop. First, a datasource that registers a component from its own `configure()` never gets that
component configured - the component sweep has already finished by the time the contributed-datasource
sweep runs. Second, a component whose `binding()` runs later and uses a datasource an earlier component
contributed sees it unconfigured - contributed datasources are all configured once, after every
component, not immediately after the component that contributed them.

## Barrel-exported versus sub-path only

Core's `src/components/index.ts` exports `auth`, `controller`, `health-check`, `request-tracker` and
`api-reference`. The rest - `mail`, `socket-io`, `static-asset`, `websocket` - are commented out of
the barrel on purpose and must be imported from their sub-path: they pull in optional peer
dependencies, and barrelling them would drag those peers into every consumer whether used or not.
The `controller` barrel itself is now empty: `RestComponent` comes from the kernel, and gRPC is
sub-path only.

## Related

- [Components catalog](/reference/components.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Adding a component](/process/adding-a-component.md)
- [DI container](/architecture/di-container.md)
