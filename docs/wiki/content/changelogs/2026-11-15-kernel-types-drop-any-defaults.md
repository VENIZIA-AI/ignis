---
title: The kernel types stop defaulting to any
description: "IAuthService responses default to Record<string, unknown>, TCrudRoutes and TResponseBodyOf are checked, the CRUD controllers take the repository with its default options, and a query operator handler is typed on column and value."
packages: ['@venizia/ignis-kernel']
migration:
  - id: auth-service-defaults-unknown
    symbols: [IAuthService]
    upgrade:
      before: |
        // the response type arguments defaulted to AnyObject: any key, any value
        class MyAuthService implements IAuthService {
          async signIn() { return { token: 'x', user: { id: 1 } }; }
        }
        const response = await service.signIn(context, request);
        response.user.id; // any
      after: |
        // the defaults are Record<string, unknown>: name the response types you return and read
        class MyAuthService implements IAuthService<Env, TSignInRequest, ISignInResult> {
          async signIn(): Promise<ISignInResult> { return { token: 'x', user: { id: 1 } }; }
        }
    downgrade:
      steps:
        - "Drop the type arguments; the older defaults were any-valued records, so every read compiled."
  - id: crud-routes-and-response-body
    symbols: [TCrudRoutes, TResponseBodyOf]
    upgrade:
      before: |
        // a route map typed without a repository, handed to a controller of a repository with no restore methods
        const routes: TCrudRoutes = { restoreById: true };
        CrudControllerFactory.build({ repository: ItemRepository, routes, /* ... */ });
      after: |
        // name the repository the map is for: restoreById and restoreBy exist only for a repository that has both methods
        const routes: TCrudRoutes<ItemRepository> = { find: true };
        CrudControllerFactory.build({ repository: ItemRepository, routes, /* ... */ });
    downgrade:
      steps:
        - "Type the map without a type argument as before; the older default accepted every repository."
    data: "TCrudRoutes without a type argument still lists every route. TResponseBodyOf gives the same type for a route whose responses carry application/json; a response without JSON content contributes never where it was a type error."
  - id: crud-controller-repository-default-options
    symbols: [AbstractCrudController, CrudControllerFactory]
    upgrade:
      before: |
        // definitions was any: any object fit
        const definitions = loadDefinitions(); // an untyped record
        super({ scope: 'ItemController', repository, definitions });
      after: |
        // definitions is Record<string, IAuthRouteConfig> and the repository is AbstractRepository<D, P> with its default options;
        // the shipped relational and search repositories, whose options narrow IExtraOptions, still fit
        const definitions: Record<string, IAuthRouteConfig> = loadDefinitions();
        super({ scope: 'ItemController', repository, definitions });
    downgrade:
      steps:
        - "Nothing to restore: a repository and a definitions object that fit the newer parameters fit the older any ones."
    data: "A repository whose own options narrow IExtraOptions in a way a method cannot accept bivariantly fails to type-check at the controller's constructor; the shipped repositories were checked."
  - id: query-operator-handler-types
    symbols: [TQueryOperatorHandlers, IQueryHandlerOptions]
    upgrade:
      before: |
        const handlers: TQueryOperatorHandlers = {
          // opts was { column: any; value: any }
          lengthIs: (opts) => sql`length(${opts.column}) = ${opts.value.length}`,
        };
      after: |
        // opts.value is unknown and opts.column is Column | SQL: narrow the value, or pass it to a template
        const handlers: TQueryOperatorHandlers = {
          lengthIs: (opts) =>
            typeof opts.value === 'string' ? sql`length(${opts.column}) = ${opts.value.length}` : undefined,
        };
    downgrade:
      steps:
        - "Type the handler's parameter as { column: any; value: any } again; a handler typed on IQueryHandlerOptions fits both."
  - id: normalize-count-data-constraint
    symbols: [BaseRestController.normalizeCountData]
    upgrade:
      before: |
        this.normalizeCountData<ZodType>({ context, data });
      after: |
        // non-breaking: the ResponseSchema type argument has no constraint now, every call still compiles
        this.normalizeCountData<ZodType>({ context, data });
    downgrade:
      steps:
        - "Nothing to restore: a type argument that compiled with the constraint compiles without it."
---

# Changelog - 2026-11-15

## The kernel types stop defaulting to any

<Badge type="warning" text="Breaking Change" />

**In one line.** The kernel's auth, CRUD controller and query operator types say what they hold instead of `any`, and nothing changes at runtime.

## What changed

- **Auth.** `IAuthService` response types default to `Record<string, unknown>`.
- **CRUD.** `TCrudRoutes` defaults to a repository with both restore methods; `TResponseBodyOf` reads the JSON schema through a helper; the CRUD controller constructors take the repository with its default options and `definitions` as `Record<string, IAuthRouteConfig>`.
- **Query operators.** `TQueryOperatorHandlers` handlers take `column: Column | SQL` and `value: unknown`.

## Who is affected

- **Code that implements `IAuthService` without naming its response types and reads them, types a route map as the bare `TCrudRoutes` against a specific repository, or writes its own operator handler typed `any`.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const response = await service.signIn(context, request);
response.user.id;
```

**After:**

```typescript
const response: ISignInResult = await service.signIn(context, request);
response.user.id;
```
