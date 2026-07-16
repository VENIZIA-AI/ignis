---
type: Architecture
title: Controller system
description: How IGNIS controllers wrap OpenAPIHono routers and the three ways to declare routes on them.
resource: packages/core/src/base/controllers
tags: [architecture, controllers, rest, hono, openapi]
---

An IGNIS controller owns an `OpenAPIHono` router. It does not wrap Hono behind an abstraction - it
holds a real router instance, registers real Hono routes on it, and the application mounts that
router onto the root router at the controller's path. There is no per-request framework layer between
Hono and your handler.

**REST is the framework's default behavior, not a component you opt into.** `RestComponent` is merely
the internal mechanism `registerControllers()` uses to mount REST routers; REST is what an IGNIS
application does unless `configs.transports` says otherwise. Do not model it as extractable.

## The class hierarchy

- `AbstractRestController extends BaseHelper` - owns `router: OpenAPIHono`, `path`, `definitions`,
  `isConfigured`; resolves the path from `@controller` metadata (falling back to constructor options)
  and throws by class name if neither supplies one; integrates the authenticate/authorize middlewares
  into route configs.
- `BaseRestController extends AbstractRestController` - the recommended base. Adds the concrete
  `bindRoute` / `defineRoute` / `defineJSXRoute` implementations plus `measure()`.

A parallel `AbstractGrpcController` / `BaseGrpcController` pair lives under `base/controllers/grpc`.

## Three ways to declare a route

**Decorator style** - `@api`, or the method-specific `@get`, `@post`, `@put`, `@patch`, `@del`, which
are thin wrappers that fill in `method`. They record the route config against the method name in the
metadata registry; the controller's `configure()` later turns each into a real route.

```typescript
@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) { super({ scope: UserController.name }); }

  @get({ configs: { path: '/', responses: { 200: { /* zod schema */ } } } })
  async find(context) { /* ... */ }
}
```

**Imperative style** - `defineRoute({ configs, handler, hook? })` registers config and handler in one
call, straight onto the router.

**Fluent style** - `bindRoute({ configs })` returns an object whose `.to({ handler })` completes the
registration. Useful when the config is computed separately from the handler.

All three converge on `this.router.openapi(routeConfigs, handler)`. Route configs are
`@hono/zod-openapi` `createRoute` shapes, so schemas are Zod, validation is generated from them, and
the OpenAPI document derives from the same source rather than being hand-maintained alongside it.

## The CRUD controller factory

`ControllerFactory.defineCrudController({ controller, entity, authenticate, authorize, routes })`
generates a fully typed CRUD controller from an entity definition, with per-route customization via
`routes`. Under it sit `AbstractCrudController`, `ReadableCrudController` and
`PersistableCrudController`, mirroring the read/write split on the repository side. `entity` accepts
a class or a thunk returning one (`isClass(entity) ? entity : entity()`), which is how circular model
imports are broken.

## Mounting

`RestComponent.binding()` scans `controllers.*` bindings, skips anything whose metadata says the
transport is gRPC, requires a non-empty `path` (throwing by binding key if absent), resolves the
instance, awaits `instance.configure()`, then `router.route(metadata.path, instance.getRouter())`.
Like the rest of the lifecycle it re-scans excluding what it already configured, so a controller
bound by another controller's configuration still gets mounted.

## The decorator-semantics trap

Route decorators are legacy (`experimentalDecorators`) decorators: the runtime must call them with
`(prototype, methodName, descriptor)`. A runtime that compiles decorator syntax with TC39 semantics
calls them with `(method, context)` instead - there is no prototype to attach metadata to, so **the
route is never registered and the endpoint silently 404s**.

`isLegacyMethodDecoratorCall` detects the wrong call shape and records the dropped decorator;
`reportDroppedRouteDecorators` warns once per process at `configure()` time (not at import time -
importing a module must stay free of side effects). If routes 404 for no visible reason, look for
that warning: the cause is `experimentalDecorators` missing from the tsconfig **the runtime actually
resolves**, and a tsconfig whose `extends` chain the runtime cannot resolve is discarded whole.

## Related

- [Application lifecycle](/architecture/application-lifecycle.md)
- [Component model](/architecture/component-model.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Gotchas](/conventions/gotchas.md)
