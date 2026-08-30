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
| `repositories/` | `AbstractRepository`, the repository error codes, the decorated query schemas, and `sqls/` (`RecursiveTreeSql`) |
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

`IModelSettings.scopeFilter` (`helpers/inversion/common/types.ts`) is the model-settings surface for
a per-request row scope: `resolve()` returns a `where`, re-evaluated per query, and `onMissing`
(default `deny`) decides what happens when it returns null/undefined. The kernel only declares the
shape; `RelationalBaseRepository` in `connectors` is what enforces it - see
[connectors](/packages/connectors.md) for the enforcement, the `restore()` interaction with
`shouldSkipDefaultFilter`, and the search-repository gap.

## Recursive tree SQL

`base/repositories/sqls/recursive-tree.ts` exports `RecursiveTreeSql.walk(opts)`, which builds a
`WITH RECURSIVE` fragment (a Drizzle `SQL` value) walking an adjacency-list table up (ancestors) or
down (descendants) from `rootId`, for Postgres or SQLite. It lives here rather than in `helpers`
because it returns Drizzle `SQL` - `helpers` carries no `drizzle-orm` dependency, deliberately.
Ported from 14 hand-written BANA queries that each had to remember their own depth guard; one of
the 14 forgot and hung a production process walking an unbounded parent chain.

- **`maxDepth` is mandatory, no default, and validated at runtime (`<= 0` throws via `getError`).**
  `0` type-checks but produces a recursive term that never runs and a result set that is silently
  empty - the exact "zero looks plausible" failure this parameter exists to prevent. **It counts
  EDGES, not rows**: the root sits at `depth 0`, so `maxDepth: N` returns up to `N+1` rows (measured
  against a real Postgres - `1` gives 2 rows, `4` gives 5). "Depth" and "how many levels I want back"
  are the same word to most callers and differ by one.
- **`table` stays `unknown`**, checked at runtime with `is(table, Table)` from `drizzle-orm` rather
  than tightened to a Drizzle generic - this package cannot see an application's schema, and a type
  that pretends to know is worse than `unknown` because it looks safe. A non-table throws `getError`
  naming what actually arrived.
- **`table` also selects the SQL dialect.** `walk` checks `is(table, PgTable)` (from
  `drizzle-orm/pg-core`) and `is(table, SQLiteTable)` (from `drizzle-orm/sqlite-core`) and compiles
  the matching form internally, tagged with a private `RecursiveTreeEngines` const-class - there is
  no `engine` option in `IRecursiveTreeOptions`, so the public API gained no new parameter and there
  is no seam where an option could disagree with the schema it was called with. A table belonging to
  neither (e.g. `drizzle-orm/mysql-core`'s `MySqlTable`) throws the same `getError` naming what
  arrived, rather than silently compiling with the wrong dialect's syntax.
- **SQL injection is the primary risk, not the usual value-parameterization one.** `name`,
  `idColumn`, `parentColumn`, and every entry of `columns` become identifiers, and identifiers
  cannot be parameterized the way values can. Each is checked against a strict allowlist
  (`^[A-Za-z_][A-Za-z0-9_]*$`) before it reaches a template, on top of `sql.identifier`'s own
  quoting. `rootId`, `maxDepth`, and `startDepth` are ordinary bound parameters.
- **`trackPath: true`** emits a `path` value and an `is_cycle` flag, and adds `AND NOT r.is_cycle` to
  the recursive term so a row already flagged cyclic is never expanded again. Without `trackPath`,
  `maxDepth` alone still guarantees termination - it is the unconditional bound, `trackPath` only
  adds early detection and a visible flag. **Both emitted columns reach the caller in a different
  shape per engine, and nothing in the signature shows it** - `walk()` returns a `SQL`, so the row
  shape is whatever the driver hands back. Postgres gives `path: string[]` and `is_cycle: boolean`;
  SQLite gives `path: string` (ids wrapped in `char(31)`) and `is_cycle: 1 | 0`, because SQLite has
  no boolean literal. `row.path.length` therefore throws on SQLite, and `row.is_cycle === true` is
  quietly always false there - read it truthily and split `path` on `String.fromCharCode(31)`. The
  cycle guard's shape differs by engine because SQLite has no array type:
  - **Postgres**: `path` is a native array (`ARRAY[...]`), membership is `= ANY(path)` - unchanged
    from the original Postgres-only version, verified byte-identical by a dedicated test.
  - **SQLite**: `path` is text, with every id wrapped on both sides by `char(31)` (the ASCII Unit
    Separator, via a `sql.raw('char(31)')` constant) so a delimiter-bounded `instr(path, char(31) ||
    id || char(31)) > 0` cannot partial-match (an id of `1` inside a path containing `12`). This is
    exact as long as no id value itself contains a `char(31)` byte - a control character that does
    not occur in ordinary UUIDs, serials, slugs, or emails, but `RecursiveTreeSql` does not validate
    or escape id values against it. An id that did contain that byte could produce a false-negative
    cycle match. `depth`'s cast also differs (`::int` for Postgres, `CAST(... AS INTEGER)` for
    SQLite) since SQLite has no `::` cast operator.
- `RecursiveTreeDirections` (`UP`/`DOWN`) follows the repo's const-class + `TConstValue` idiom, not
  a bare `as const` object - see `RepositoryOperationScopes` for the same shape.
- The counterpart in-memory tree utilities (`ITreeNode<T>`, `TreeWalker`, `TreeBuilder`) live in
  `@venizia/ignis-helpers`' `modules/tree` - see [helpers](/packages/helpers.md). They are pure and
  carry no Drizzle dependency, which is why they are not here too.

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
