---
type: Architecture
title: Component model
description: What an IGNIS component is, how it declares its bindings, and where it runs in the application lifecycle.
resource: packages/core/src/base/components
tags: [architecture, components, lifecycle, di]
---

A component is IGNIS's unit of pluggable capability: a class that owns a set of default bindings and
one `binding()` method that wires itself into the application. Health checks, the API reference UI,
authentication, mail, static assets and Socket.IO are all components.

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
and skips it if so. This is the whole configuration story - an application overrides a component's
options simply by binding that options key **before** the component configures.

## A real component

```typescript
export class HealthCheckComponent extends BaseComponent {
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

  override binding(): ValueOrPromise<void> {
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

Two things generalize. The options are read back with `isOptional: true` and defaulted again - a
partially filled options binding (env or config driven) must not take the app down at boot. And the
component reaches the application through `@inject({ key: CoreBindings.APPLICATION_INSTANCE })`,
using the application's own registration helpers rather than binding by hand.

`RequestTrackerComponent` is the middleware variant: it declares its middleware under a
`middlewares.*` key with `toProvider(...)` at singleton scope, then in `binding()` pulls it back out
of the container and installs it with `server.use(mw)`.

## How components get run

`application.component(Ctor)` binds the class under `components.<ClassName>` at **singleton** scope.
The namespace auto-tagging in `Binding` tags it `components`, and `registerComponents()` scans that
tag, resolves each binding, and awaits `configure()`.

That scan re-runs excluding what it already configured, so **a component may register more
components**. It also passes `onAfterConfigure`, which re-runs the datasource scan after each
component - so **a component may add datasources**, configured immediately rather than missed. This
is why `registerComponents()` sits between `registerDataSources()` and `registerControllers()`.

## Barrel-exported versus sub-path only

`src/components/index.ts` exports only `auth`, `controller`, `health-check`, `request-tracker` and
`api-reference`. The rest - `mail`, `socket-io`, `static-asset`, `websocket` - are commented out of
the barrel on purpose and must be imported from their sub-path: they pull in optional peer
dependencies, and barrelling them would drag those peers into every consumer whether used or not.

## Related

- [Components catalog](/reference/components.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Adding a component](/process/adding-a-component.md)
- [DI container](/architecture/di-container.md)
