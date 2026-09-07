---
type: Playbook
title: Adding a component
description: Ordered steps to add a new component under packages/core-server/src/components.
resource: packages/core-server/src/components
tags: [process, component, core]
---

## Steps

1. Create a directory under `packages/core-server/src/components/<name>/` with at least `component.ts` and
   `index.ts`. Larger components (see `mail/`) add `common/` (types, keys, constants),
   `services/`, `helpers/`, `providers/`, `utilities/` as needed - none of that is required for a
   small component (see `health-check/` or `request-tracker/`, which are just `component.ts` +
   `index.ts` + a small `common/`).
2. The component class extends `BaseComponent`, imported from `@venizia/ignis-kernel` (defined at
   `packages/kernel/src/base/components/base.ts`), which itself extends `BaseHelper`. Implement the
   one abstract method: `binding(): ValueOrPromise<void>` - this is where the component does its
   actual work (register a controller, attach middleware, open a client), NOT in the constructor.
3. Constructor: inject the running application via `@inject({ key:
   CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication`, and call `super({
   scope: <ClassName>.name, initDefault: { enable: true, container: application }, bindings: {...}
   })`. Every constructor parameter must carry `@inject` - see
   [DI container](/architecture/di-container.md) for why an undecorated parameter is refused at
   boot, not silently ignored.
4. Declare the component's own default bindings in the `bindings` option, keyed by a binding key
   constant (e.g. `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS`) and built with `Binding.bind({
   key }).toValue(...)` or `.toProvider(...).setScope(BindingScopes.SINGLETON)`. `initDefault:
   {enable: true, container: application}` tells `BaseComponent.configure()` to register these
   defaults into the container BEFORE `binding()` runs, but only for keys not already bound - so a
   consuming app can override a default by binding the same key earlier.
5. Inside `binding()`, read your own options back out with `this.application.get({ key, isOptional:
   true })` and fall back to a module-level `DEFAULT_OPTIONS` constant - a component must never
   crash boot because a partially-filled options binding left a field undefined.
6. To register a controller from inside a component (rather than requiring the consuming app to
   call `this.controller(...)` itself), use `Reflect.decorate([controller({ path })],
   YourController)` followed by `this.application.controller(YourController)` - this is how
   `HealthCheckComponent` applies a runtime-configurable REST path to a controller class that
   wasn't decorated with a literal path at author time.
7. To attach a Hono middleware, get the server with `this.application.getServer()` and call
   `server.use(...)` inside `binding()` - see `RequestTrackerComponent`, which resolves its
   middleware from its own registered binding via `this.application.get({ key })` and throws (via
   `getError`) if that binding is missing, rather than silently no-op-ing.
8. Export the component class from the directory's `index.ts`, and from
   `packages/core-server/src/components/index.ts` if it should be part of the main `@venizia/ignis`
   entrypoint. A component with heavy optional peer dependencies instead gets its own sub-path
   export in `packages/core-server/package.json` `exports` (see how `./mail`, `./socket-io`,
   `./static-asset` are wired) plus a matching `peerDependenciesMeta` optional entry.
9. Wire it into an application. A framework component is listed once in the application's config:
   `artifacts: [GeneratedArtifacts, { components: [YourComponent] }]`. An application-owned component
   is decorated with `@component()` and picked up by `bun run generate:artifacts`. Either way the
   class binds under `components.<ClassName>` as a SINGLETON at the `registerArtifacts` step, and the
   `registerComponents()` step finds every binding tagged `components` and calls `.configure()` on
   each, which is what invokes your `binding()`. `this.component(YourComponent)` in `preConfigure()`
   still works. Options that other components read belong in `@provide` methods of an
   application-owned component, not in `this.bind(...).toValue(...)` - see
   [Artifact registration](/architecture/boot-lifecycle.md).

## Related

- [Component model](/architecture/component-model.md)
- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Reference: components](/reference/components.md)
