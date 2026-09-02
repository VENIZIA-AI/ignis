---
type: Architecture
title: Application lifecycle
description: The four application layers, the real order in which BaseApplication configures itself and starts serving, and why each step sits where it does.
resource: packages/kernel/src/base/applications
tags: [architecture, lifecycle, application, bootstrap]
---

An IGNIS application is a container that grows a router and then a server, one layer at a time. The
base is a four-class chain split across two packages:

| Class | Lives in | Adds |
|---|---|---|
| `AbstractApplication extends Container` | `packages/kernel/src/base/applications/abstract.ts` | config normalisation, project root, post-start/post-stop hooks, `init()` and `registerCoreBindings()`. No router, no server. |
| `RestApplication` | `packages/kernel/src/base/applications/rest.ts` | the two `OpenAPIHono` instances, `getServer()`, `getRootRouter()`, `inspectRoutes()`, and the `APPLICATION_SERVER` / `APPLICATION_ROOT_ROUTER` bindings. |
| `ServerApplication` | `packages/core-server/src/base/applications/server.ts` | the only layer that touches a socket: `getServerHost/Port/Address`, `startBunModule`, `startNodeModule`, `start()`, `stop()`. |
| `BaseApplication` | `packages/core-server/src/base/applications/base.ts` | the configuration sequence, secrets, boot wiring. |

The cut is deliberate. The first two layers are browser-pure and ship in `@venizia/ignis-kernel`, so
a Worker or a gRPC-only host can extend `RestApplication` without pulling in `Bun.serve` or
`@hono/node-server`. `packages/core-server/src/base/applications/index.ts` re-exports the kernel classes, so
`@venizia/ignis` consumers see no change.

The outermost order is `new Application({ scope, config })` -> `init()` -> optional `boot()` ->
`start()`. **`init()` is not called for you.** It runs `registerCoreBindings()`, which binds
`APPLICATION_INSTANCE` (on `AbstractApplication`) plus `APPLICATION_SERVER` and
`APPLICATION_ROOT_ROUTER` (on `RestApplication`). Skip it and the `Bootstrapper` and every
`@inject`ed application reference are unresolvable. `APPLICATION_PROJECT_ROOT` is bound earlier still,
from the constructor.

`start()` (on `ServerApplication`) is the outer driver:

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

`BaseApplication.getBootSequence()` composes the configuration sequence; `initialize()` hands
whatever it returns to kernel's `runBootSequence()`, which runs the steps in order with one measured
`[initialize] DONE | Boot step n/N <name> | Took` line per step at debug level, an info summary
naming every step, and an error line naming the step that threw before rethrowing its original
error. `BaseApplication` re-declares `initialize()` with the identical one-line body as a version
tripwire only: a core-server paired with a kernel that predates `getBootSequence()` throws at boot
instead of silently running the short kernel sequence.

Step names are published constants, not loose strings: `BootSteps` in kernel
(`packages/kernel/src/base/applications/boot-sequence.ts`) for the eight steps the kernel defines
methods for, `ServerBootSteps extends BootSteps` in core-server
(`packages/core-server/src/base/applications/boot-steps.ts`) adding the five server-only ones. Both carry `SCHEME_SET` and `isValid()` like every const class
here, and the server set contains the kernel set. They are what a subclass passes as `target` to
`BootSequence.insertAfter`, which refuses an unknown name and a duplicated one alike - the first
match is never taken silently. The effective sequence for a
server application is:

1. `printStartUpInfo()` - name, env, runtime, run mode, timezone, log path.
2. `validateEnvs()` - every registered application env key must be non-empty, unless
   `ALLOW_EMPTY_ENV_VALUE` is set. Failing here is intentional: a half-configured app should never
   reach the network.
3. `registerDefaultMiddlewares()` - calls the kernel's, which installs `requestId()`, the Hono
   `onError` handler and the not-found handler, then adds the async context storage (when enabled),
   the `RequestTrackerComponent` and the favicon middleware.
4. `staticConfigure()` - pre-DI static setup, e.g. static file roots.
5. `preConfigure()` - your hook: register controllers, services, components manually.
6. `hydrateSecrets()` - resolves the provider from the overridable `registerSecrets()` (default
   `SecretProviders.SYSTEM_ENVS`), merges each secret bundle into `process.env` and the application
   environment, binds the provider under `CoreBindings.APPLICATION_CONFIG`, and registers a post-stop
   shutdown hook. Outside a development env, a failed provider - or a hydrate entry that declared
   `keys` or a `prefix` yet resolved to nothing - throws instead of falling back.
7. `registerDataSources()`
8. `registerComponents()`
9. `registerContributedDataSources()` - a second, flat `registerDataSources()` sweep that catches any
   datasource a component contributed, at any nesting depth.
10. `wireSecretRotatables()` - deliberately after the contributed sweep, not just after
    `registerComponents()`: a lease key may point at a datasource that a component contributed.
11. `registerControllers()`
12. `postConfigure()` - post-registration hook.
13. `validateScopeFilterSupport()` - refuses to start when a model declares `settings.scopeFilter`
    somewhere it cannot take effect. Runs last, so a model registered by a component is covered too.

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
- Components come next. A component may add a datasource of its own, at any nesting depth (a
  component registering a component registering a component...), so kernel's `RestApplication`
  exposes `registerContributedDataSources()` - a second, flat `registerDataSources()` sweep run right
  after `registerComponents()` in `RestApplication.getBootSequence()`. `BaseApplication.getBootSequence()`
  composes its own steps around `...super.getBootSequence()` rather than re-implementing `initialize()`,
  so this step reaches a server application too. `registerContributedDataSources()` calls
  `registerDynamicBindings` directly rather than the polymorphic `this.registerDataSources()`, so a
  subclass override of `registerDataSources()` can never run twice.
- Controllers come last, so a controller can inject anything a component bound.

`postConfigure()` runs after all three, which means **new datasources, components or controllers
registered in `postConfigure` are never auto-configured**. If you must add one there, call its
`configure()` yourself.

## Environment seams

The kernel layers touch no `process` at all, because a browser Worker has none. `getProjectRoot()`
returns `''` (it still binds `APPLICATION_PROJECT_ROOT`), and `getDefaultAsyncContextEnabled()`
returns `false` - a router-only or router-less application must not install `hono/context-storage`,
which needs `node:async_hooks`. Address resolution is not a seam: `host`/`port` are absent from the
kernel entirely, and `ServerApplication`'s constructor resolves them from `HOST` /
`APP_ENV_SERVER_HOST` and `PORT` / `APP_ENV_SERVER_PORT`.

`ServerApplication` overrides both to restore the serving behaviour: `process.cwd()`, and async
context on. An application may override
`getProjectRoot()` further. Host falls back to `localhost` and port to `3000`; port `0` survives
resolution because candidates are rejected on validity, not falsiness, and `0` legitimately asks the
OS for an ephemeral port.

All of these seams are called from the `AbstractApplication` **constructor**, before any subclass
field initialiser has run. An override must therefore return a pure literal or read only module-level
state - reading an instance field from one silently yields `undefined`.

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

`start()`, `stop()`, `startBunModule()` and `startNodeModule()` all live on `ServerApplication`.
`RuntimeModules.detect()` picks Bun or Node. The Node path imports `@hono/node-server` dynamically
and resolves from the listening callback rather than from `serve()`'s synchronous return - only then
is the socket actually bound and an OS-assigned port (config port `0`) known. `stop()` bridges Node's
callback-based `close()` into a promise for the same reason: otherwise it resolves while the socket
is still bound and an immediate restart races the old listener.

`executePostStartHooks()` and `executePostStopHooks()` stay on `AbstractApplication`. Post-start hooks
run **in isolation**: the server is already listening, so a hook that throws must not cancel the hooks
queued behind it - failures are collected and thrown as one error once every hook has had its turn.

## Related

- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [Component model](/architecture/component-model.md)
- [Controller system](/architecture/controller-system.md)
- [DI container](/architecture/di-container.md)
