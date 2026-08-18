---
type: Package
title: kernel
description: The browser-pure half of the IGNIS framework - DI container, application lifecycle, REST controllers, the repository and datasource abstractions, and the authentication and authorization seams.
resource: packages/kernel
tags: [packages, kernel, browser, isomorphic, di]
---

`@venizia/ignis-kernel` holds everything in the framework that needs neither a node builtin nor a
server-only peer, so the same kernel serves a Bun server and a browser Worker. It sits beside `boot`
in the dependency chain (`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core`)
and depends on `filter`, `helpers`, and `inversion`. `boot` is a sibling, not a link - neither
package depends on the other, and `core` pulls in both (`make core` needs `boot kernel`). Sitting
beside `boot` rather than after it is what keeps boot's node-only glob discovery out of the kernel
graph.

It ships a **single-format build** (`dist/index.js`, one `exports` entry plus `package.json`), unlike
`inversion`, `filter`, and `boot`, which build CJS and ESM. `packages/core-server/src/index.ts` re-exports
the kernel barrel wholesale, so `@venizia/ignis` keeps its published name and its full public
surface: no consumer import changed when this package was carved out of core.

## What it owns

Everything under `src/base/` was the engine-neutral half of `packages/core-server/src/base`:

| Subsystem | What lives there |
|---|---|
| `applications/` | `AbstractApplication` (container, config, lifecycle hooks), `RestApplication` (adds the router) |
| `auth/` | The authentication and authorization seams - registries, middlewares, providers, policy builders |
| `components/` | `BaseComponent` and its `binding()` contract |
| `controllers/` | `AbstractRestController`, `BaseRestController`, `ControllerFactory` |
| `datasources/` | `AbstractDataSource` - the engine-neutral root with no SQL members |
| `metadata/` | The decorator layer: `@controller`, `@model`, `@datasource`, `@repository`, `@inject`, the REST verbs, the RPC verbs |
| `middlewares/` | `emojiFavicon`, the not-found handler, and `RequestErrors` |
| `mixins/` | The mixin contracts (`IComponentMixin`, `IControllerMixin`, `IRepositoryMixin`, ...) that compose onto an application |
| `models/` | `AbstractEntity` and the model settings shape |
| `providers/` | `BaseProvider` |
| `repositories/` | `AbstractRepository`, the repository error codes, and the decorated query schemas |
| `request-context/` | `RequestContextRegistry` - the seam a server layer installs `hono/context-storage` into |
| `services/` | `BaseService` and the CRUD service base |

Alongside it: `src/common/` carries `BindingNamespaces`, `CoreBindings`, the framework error codes,
and `Statuses`; `src/helpers/inversion/` carries the kernel `Container` and `MetadataRegistry`;
`src/utilities/` carries the error, JSX, and schema helpers.

## Browser purity is the design constraint, and it is measured

`scripts/purity/manifest.ts` claims this package's whole published surface and derives its rows from
the `exports` map, so today that is `packages/kernel/dist/index.js` and whatever is added next.
`make purity-kernel`
bundles it for `target: 'browser'` and fails on any node builtin or node global. Purity is a property
of the resolved graph, so the rule is about how peers are reached, not which peers are declared:
`drizzle-orm`, `casbin`, and `jose` are reached through `import type` only and never survive into the
bundle, and all three are declared optional in `peerDependenciesMeta` - a non-optional peer that the
package never requires would force a browser consumer under npm 7+ or pnpm strict peers to install a
SQL ORM and a JOSE crypto stack for a handful of type aliases. `hono` and `@hono/zod-openapi` are
real value imports and are browser-safe. The gate reads `dist/`, so build before running it.

The probe grades a node-global read by whether it can throw, not by whether it uses optional
chaining. `globalThis.process?.env?.X` is a property read on an object that always exists, so it is
reported as `guarded` and stays green; `globalThis.process.env.X` and bare `process.env.X` are fatal.
Bare `process?.X` is only reported, because the probe matches bundled text and cannot see scope -
hono's `getColorEnabled` destructures `const { process } = globalThis` first, which is safe.

## The seams core fills in

`AbstractApplication` leaves two `protected` methods deliberately inert, because a browser Worker
has no `process` and no working directory. `ServerApplication` in core overrides both, so server
behaviour is unchanged:

- `getProjectRoot()` returns an empty string and binds it; the server override binds the real cwd. It
  stays a plain overridable method, so an application that overrides it keeps working.
- `getDefaultAsyncContextEnabled()` returns `false`, which keeps a router-only application from
  installing `hono/context-storage` and therefore `node:async_hooks`; the server override returns
  `true`.

`host` and `port` are NOT seams - they left the kernel entirely. `IApplicationConfigs` here declares
neither, `ServerApplication` resolves both in its own constructor, and `@venizia/ignis` re-exports
the widened `IServerApplicationConfigs` under the name `IApplicationConfigs` so a server application
still sees them. The kernel used to write `localhost:3000` into every Worker application's config.

The same split runs through the contracts: kernel `IApplication` declares only what EVERY host
implements, and `getServerHost`/`getServerPort`/`getServerAddress`/`start`/`stop` sit on
`@venizia/ignis`'s `IServerApplication`. `RestApplication.server` is `{ hono }` alone - which runtime
is underneath and which socket is bound belong to `ServerApplication`.

## One default middleware stack

`RestApplication.registerDefaultMiddlewares()` installs the three registrations every host shares:
`requestId()` fed by `RequestIdGenerator`, the framework error handler, and `notFoundHandler`.
`WorkerApplication` inherits it untouched; `BaseApplication` calls `super()` and adds
`contextStorage`, `RequestTrackerComponent` and the favicon on top. `buildErrorMiddleware()` is the
one seam inside it, which core overrides to swap in the `ErrorPrettier`-backed formatter; it feeds
`config.error.environment` through as the middleware's `environment` option, which is how a browser
application declares the ambient environment it has no `process.env` to read.

`RequestContextRegistry` (`base/request-context/`) is the same idea for code that only wants to READ
the ambient request context. `setResolver({ resolver })` takes a synchronous
`() => Context | undefined`, `resolve()` calls it, and `clearResolver()` removes it. Core's
`registerDefaultMiddlewares()` installs a `tryGetContext()`-backed resolver; a browser Worker
installs none and `resolve()` answers `undefined`.

`undefined` means THERE IS NO REQUEST CONTEXT - deliberately distinct from a context that carries no
user, which is what the caller reads off that context's own variables. The user-audit enrichers in
`connectors` are the reason: they raise a different error for each of the two, so a resolver that
collapsed them would change behaviour on a security-adjacent path. Same shape as
`RelationBuilderRegistry`, and the same motivation: one value import of the concrete implementation
would drag a node-only module into every graph that touches the kernel.

Port resolution rejects candidates on **validity, not falsiness** - `0` legitimately asks the
operating system for an ephemeral port.

## Container and MetadataRegistry

The kernel's `Container` extends the one from `inversion` and overrides `getMetadataRegistry()` to
return the kernel `MetadataRegistry` singleton, which is `inversion`'s registry with the datasource,
model, repository, controller, REST-controller, and gRPC-controller metadata mixins composed on. That
is where the model registry, the repository bindings, and datasource auto-discovery live.

The `Container` constructor takes its logger through `BaseHelper` / `LoggerResolver`, never
`LoggerFactory` directly. The resolver's console fallback is what keeps the constructor - and
everything extending it, which is every application - browser-pure. A server host still gets the real
provider, because importing `LoggerFactory` as a value anywhere in the process installs it as the
active resolver.

## Repositories, datasources, and the query schemas

`AbstractRepository` extends `BaseHelper`, declares every verb abstract, and resolves its datasource
and entity lazily: the datasource comes from the constructor or a setter, the entity from
`@repository` metadata on first access, and the `@model` settings are memoized with `null` as the
not-yet-resolved marker because `undefined` is itself a valid resolved value. Every connector chain
in core descends from it - see [repository hierarchy](/architecture/repository-hierarchy.md).

`base/repositories/query-schemas/` is where the filter schemas become server schemas. `filter` builds
them with plain `zod` so a browser can use them; this module imports `@hono/zod-openapi` for its
side effect (patching `.openapi()` onto the shared prototype) and calls
`buildQuerySchemas({ decorate })` to re-export the documented versions under the original names.
Server code must import them from here, never from `@venizia/ignis-filter/schemas` - the undecorated
instances validate identically and document nothing.

## Auth seams

`AbstractAuthRegistry` is the shared shape behind the strategy registry and the enforcer registry:
descriptors keyed by name, each bound into the container as a singleton under a namespaced key. On
top of it sit the authenticate and authorize middlewares, their providers, the request-domain
resolver, and the grant, permission, and policy builders that serialize into Casbin rows. The
concrete `AuthenticateComponent` and `AuthorizeComponent` stay in core. See
[authentication](/architecture/authentication.md) and
[Casbin authorization](/architecture/authorization-casbin.md).

## Gotchas

- `base/middlewares` is exported from the base barrel deliberately, not by accident: core's own
  application base and request-spy middleware read `REQUEST_ID_KEY` and register `RequestErrors`
  across the package boundary the split introduced.
- Application code should keep importing from `@venizia/ignis`. Install this package directly only
  when you want the framework skeleton WITHOUT the server layer - the browser case.
- `build.sh` type-checks `src` and `src/__tests__` before emitting, so a type error in a test blocks
  the production build. See [build system](/process/build-system.md).

## Related

- [core](/packages/core-server.md)
- [filter](/packages/filter.md)
- [inversion](/packages/inversion.md)
- [Controller system](/architecture/controller-system.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
