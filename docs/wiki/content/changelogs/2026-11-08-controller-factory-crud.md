---
title: ControllerFactory.crud replaces defineCrudController, and a CRUD controller has the routes you list
description: "One call takes the repository class and a routes map. The path is on @controller, the entity comes from @repository, and restore routes are new."
packages: ['@venizia/ignis', '@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-11-08

## ControllerFactory.crud replaces defineCrudController, and a CRUD controller has the routes you list

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="New Feature" />

**In one line.** `ControllerFactory.crud({ repository, routes })` builds a CRUD controller from the repository class. A route you list exists and a route you do not list does not. `defineCrudController` is gone, with no alias.

## What changed

- **`ControllerFactory.crud` takes the repository class.** The entity comes from `@repository({ model })` on that class, so you name it once. The container injects the repository by the class name.
- **The path is only on `@controller({ path })`.** The name is the class name. `controller.basePath` and `controller.name` are gone.
- **`routes` is the whole list.** `routes: { find: true, create: true }` builds those two routes. A route takes `true` or a config (`authenticate`, `authorize`, `request`, `response`), and a route's own `authenticate` and `authorize` replace the controller's.
- **`CrudRoutes.READ` lists the four read routes:** `count`, `find`, `findById`, `findOne`. `routes: { ...CrudRoutes.READ, create: true }` adds one write route.
- **Restore routes are new.** `restoreById` is `POST /{id}/restore`, and `restoreBy` is `POST /restore` with `where` in the query. They are checked against the UPDATE scope of the model. There is no route that lists deleted rows.
- **A restore route needs a repository that has both restore methods.** The types refuse `restoreById` and `restoreBy` for a repository class that lacks either one, and the build throws for a caller the types do not reach.
- **The generated routes register after the subclass's `binding()`.** A custom static path you declare there, such as `GET /featured`, is no longer taken by `GET /{id}`. The same order means a custom `GET /count` in `binding()` now shadows the generated `count` route, where before the generated one came first.
- **A new hook, `bindDefaultRoutes()`, on `BaseRestController`.** It registers the routes a generated controller brings, after `binding()`. A hand-written controller does not need it.
- **The row types come from the repository class.** `AbstractRepository` carries two phantom markers, `$inferData` and `$inferPersist` (no runtime value), the way an entity does, and `TRepositoryDataObject` and `TRepositoryPersistObject` read them. `this.repository` and the payloads of a generated controller are typed with the exact row of a relational table or a search document.
- **The write-route check covers only listed routes.** `ControllerFactory.crud` still refuses to boot when a listed write route would inherit a controller-level `authorize` whose action is `read`. A route you do not list is not checked.
- **An update reads its `data` once.** `updateById`, `updateBy`, `updateEach`, `upsert` and a soft delete copy the caller's `data` into a plain object, check that copy for `deletedAt`, and write that same copy.
- **Search is next.** `defineSearchController` keeps its current form until its own change, in the same release line.

## Who is affected

- **Every call to `ControllerFactory.defineCrudController`.** Rewrite it to `ControllerFactory.crud`, as below.
- **A CRUD controller that used `controller.readonly`, `controller.enabledRoutes` or a route's `enabled`.** List the routes instead.
- **A CRUD controller subclass that called `super.binding()`.** The generated `binding()` is now empty, so the call does nothing: delete it.
- **A call that gave `controller.isStrict`, an `entity` that is not the model of the repository, or type arguments** (`defineCrudController<TRecord>`). See the three rewrites below.
- **Code that imports `ICrudControllerOptions`.** Its type parameter is now the repository class, not the route map.
- **Code that extends `AbstractCrudController`, or calls `ControllerFactory.assertWriteVerbsDeclareAuthorize` or `RouteConfigResolver.defineControllerRouteConfigs`.** `AbstractCrudController` no longer takes a `path` option (the path is the `@controller` one). `assertWriteVerbsDeclareAuthorize` takes `{ repositoryName, authorize, routes }` instead of `{ controllerName, authorize, routes, readonly, enabledRoutes }`. `defineControllerRouteConfigs` lost its `Routes` type parameter, and builds a definition only for a listed route.
- **A repository class that subclasses `AbstractRepository` and declares a member named `$inferData` or `$inferPersist`.** Rename it.
- **A `defineSearchController` controller whose repository class has a different document type from the entity** (for example `extends DefaultSearchRepository` with no type argument). The constructor now checks the repository against the entity's document type, so it fails to compile until the repository names that type: `DefaultSearchRepository<TArticle>`.
- **A custom controller factory that calls `ControllerFactory.registerRepositoryInjection`.** The option `controllerName` is removed.
- **A repository class with no `@repository({ model })`.** `ControllerFactory.crud` cannot resolve the entity and throws at build.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Every CRUD controller built with `defineCrudController` stops compiling. Each old form has one new form.

**The factory, the path and the entity:**

```typescript
// Before
const _Controller = ControllerFactory.defineCrudController({
  entity: () => Note,
  repository: { name: NoteRepository.name },
  controller: { name: 'NoteController', basePath: '/notes' },
});

@controller({ path: '/notes' })
export class NoteController extends _Controller {}

// After
const _Controller = ControllerFactory.crud({
  repository: NoteRepository, // @repository({ model: Note, ... }) supplies the entity
  routes: { ...CrudRoutes.READ, create: true, updateById: true, updateBy: true, deleteById: true, deleteBy: true },
});

@controller({ path: '/notes' })
export class NoteController extends _Controller {}
```

The old call built all nine routes. List all nine to keep them.

**`controller.isStrict` moves to the top level:**

```typescript
// Before
controller: { name: 'NoteController', basePath: '/notes', isStrict: { path: true, requestSchema: true } },

// After
isStrict: { path: true, requestSchema: true },
```

**An `entity` thunk or class moves to the repository.** The entity of a controller is the `model` of its `@repository` decorator, which takes a class or a thunk. A controller whose `entity` was not the model of its repository has no equivalent: give it a repository class whose model is that entity.

```typescript
// Before
ControllerFactory.defineCrudController({ entity: () => Note, repository: { name: NoteRepository.name }, ... });

// After
@repository({ model: () => Note, dataSource: PostgresDataSource })
export class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

ControllerFactory.crud({ repository: NoteRepository, ... });
```

**Type arguments are gone.** `ControllerFactory.crud` takes the row types from the repository class, so drop them:

```typescript
// Before
ControllerFactory.defineCrudController<TNote>({ ... });

// After
ControllerFactory.crud({ ... });
```

**`controller.readonly`:**

```typescript
// Before
controller: { name: 'NoteController', basePath: '/notes', readonly: true },

// After
routes: CrudRoutes.READ,
```

**`controller.enabledRoutes`:**

```typescript
// Before
controller: { name: 'NoteController', basePath: '/notes', enabledRoutes: ['count', 'create'] },

// After
routes: { count: true, create: true },
```

**A route's `enabled: false`:**

```typescript
// Before: every route on, two switched off
routes: { deleteBy: { enabled: false }, updateBy: { enabled: false } },

// After: list the seven you want
routes: { ...CrudRoutes.READ, create: true, updateById: true, deleteById: true },
```

**A route's `enabled: true` with a config:**

```typescript
// Before
routes: { findById: { enabled: true, request: { params: IdSchema } } },

// After
routes: { findById: { request: { params: IdSchema } } },
```

**`super.binding()` in a CRUD controller:**

```typescript
// Before
override binding() {
  super.binding();
  this.defineRoute({ configs: featuredConfigs, handler: (context) => this.featured({ context }) });
}

// After
override binding() {
  this.defineRoute({ configs: featuredConfigs, handler: (context) => this.featured({ context }) });
}
```

**`registerRepositoryInjection` in a custom factory:**

```typescript
// Before
ControllerFactory.registerRepositoryInjection({
  target: GeneratedController,
  factoryName: 'defineReportController',
  controllerName: 'ReportController',
  repositoryName: ReportRepository.name,
});

// After
ControllerFactory.registerRepositoryInjection({
  target: GeneratedController,
  factoryName: 'defineReportController',
  repositoryName: ReportRepository.name,
});
```

Find the call sites:

```bash
rg -n 'defineCrudController' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'
rg -n 'enabledRoutes|\breadonly:\s*true|\benabled:\s*(true|false)' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'   # enabled: also matches unrelated options; read each hit
rg -n 'basePath|controller:\s*\{|isStrict' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'   # controller: { name, basePath, isStrict } of a CRUD factory call
rg -n 'super\.binding\(\)' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'
rg -n 'controllerName' --glob '*.{ts,tsx,js,mjs,cjs}' --glob '!node_modules'
```

The typecheck finds the rest: "Property 'defineCrudController' does not exist".

## Details

| File | Package |
|------|---------|
| `src/base/controllers/factory/{controller,definition}.ts`, `src/base/controllers/common/{constants,types/*}.ts` | kernel |
| `src/base/controllers/factory/crud/{abstract,persistable}.ts`, `src/base/controllers/rest/abstract.ts` | kernel |
| `src/relational/core/repositories/core/{persistable,soft-deletable}.ts` | connectors |
