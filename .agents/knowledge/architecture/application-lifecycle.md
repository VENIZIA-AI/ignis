---
type: Architecture
title: Application lifecycle
description: The real order in which BaseApplication configures itself and starts serving, and why each step sits where it does.
resource: packages/core/src/base/applications
tags: [architecture, lifecycle, application, bootstrap]
---

An IGNIS application is a container that owns a Hono server. `AbstractApplication extends Container`
holds the server plumbing and the generic start/stop machinery; `BaseApplication extends
AbstractApplication` implements the configuration sequence. There are two entry points, and the order
matters more than the phase names suggest.

`start()` (on `AbstractApplication`) is the outer driver:

```typescript
async start() {
  await this.initialize();
  await this.setupMiddlewares();
  const server = this.getServer();
  server.route(this.configs.path.base, this.rootRouter);
  // ... startBunModule() or startNodeModule() by detected runtime
  await this.executePostStartHooks();
}
```

`initialize()` (on `BaseApplication`) is the configuration sequence:

1. `printStartUpInfo()` - name, env, runtime, run mode, timezone, log path.
2. `validateEnvs()` - every registered application env key must be non-empty, unless
   `ALLOW_EMPTY_ENV_VALUE` is set. Failing here is intentional: a half-configured app should never
   reach the network.
3. `registerDefaultMiddlewares()` - installs the Hono `onError` handler, the async context storage
   (when enabled), the not-found handler, the `RequestTrackerComponent`, and the favicon middleware.
4. `staticConfigure()` - pre-DI static setup, e.g. static file roots.
5. `preConfigure()` - your hook: register controllers, services, components manually.
6. `registerDataSources()`
7. `registerComponents()`
8. `registerControllers()`
9. `postConfigure()` - post-registration hook.

Note two things that a phase list written as `... -> setupMiddlewares -> start` gets wrong: the
default middlewares are installed **early inside `initialize`**, before any user configuration, and
the user-facing `setupMiddlewares()` runs **after `initialize()` returns**, from `start()`. The error
handler must be attached before anything can throw; user middlewares must be attached after
everything they might wrap exists.

## Why datasources, then components, then controllers

`registerDynamicBindings` drives each of these. It scans bindings by tag, resolves each, calls
`instance.configure()`, then **re-scans excluding what it already configured** - because configuring
one artifact may bind more artifacts of the same kind.

- DataSources come first because repositories auto-resolve their datasource, so it has to exist.
- Components come next, and `registerComponents` passes an `onAfterConfigure` hook that re-runs
  `registerDynamicBindings` for the datasource namespace - a component is allowed to add datasources,
  and they get configured immediately rather than being missed.
- Controllers come last, so a controller can inject anything a component bound.

`postConfigure()` runs after all three, which means **new datasources, components or controllers
registered in `postConfigure` are never auto-configured**. If you must add one there, call its
`configure()` yourself.

## Transports

`registerControllers()` reads `configs.transports` (defaulting to `[ControllerTransports.REST]`) and
configures `RestComponent` and/or `GrpcComponent` accordingly. It also warns loudly when a gRPC
controller was discovered but the gRPC transport was never enabled - otherwise those endpoints just
silently do not exist.

## Boot is separate

`boot()` is not part of `initialize()`. It registers the booters, resolves the `Bootstrapper` and
runs the three boot phases. An application that uses convention-based discovery calls `boot()` before
`start()`; one that registers everything by hand in `preConfigure()` never calls it.

## Starting and stopping

`RuntimeModules.detect()` picks Bun or Node. The Node path imports `@hono/node-server` dynamically
and resolves from the listening callback rather than from `serve()`'s synchronous return - only then
is the socket actually bound and an OS-assigned port (config port `0`) known. `stop()` bridges Node's
callback-based `close()` into a promise for the same reason: otherwise it resolves while the socket
is still bound and an immediate restart races the old listener.

`executePostStartHooks()` runs every registered hook **in isolation**. The server is already
listening, so a hook that throws must not cancel the hooks queued behind it - failures are collected
and thrown as one error once every hook has had its turn.

## Related

- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [Component model](/architecture/component-model.md)
- [Controller system](/architecture/controller-system.md)
- [DI container](/architecture/di-container.md)
