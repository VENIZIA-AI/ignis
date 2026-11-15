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
        const routes: TCrudRoutes = { restoreById: true }; // default Repository was any
        type Body = TResponseBodyOf<typeof routeConfig>;
      after: |
        // TCrudRoutes without a type argument lists every route; to match one repository, name it
        const routes: TCrudRoutes<ItemRepository> = { find: true };
        // a response with no application/json content contributes never; the result is the same for the rest
        type Body = TResponseBodyOf<typeof routeConfig>;
    downgrade:
      steps:
        - "Use TCrudRoutes without a type argument as before; the older default accepted every repository."
    data: "A value typed as the bare TCrudRoutes is not assignable to TCrudRoutes<SomeRepositoryWithoutRestore>."
  - id: crud-controller-repository-default-options
    symbols: [AbstractCrudController, CrudControllerFactory, ControllerFactory.crud]
    upgrade:
      before: |
        // a subclass spelled the repository type with an any options argument
        constructor(repository: AbstractRepository<IItem, IItemPersist, any>) {
          super({ scope: 'ItemController', repository, definitions });
        }
      after: |
        // the constructor takes AbstractRepository<D, P> (default options) and definitions: Record<string, IAuthRouteConfig>;
        // the shipped relational and search repositories, whose options narrow IExtraOptions, still fit
        constructor(repository: AbstractRepository<IItem, IItemPersist>) {
          super({ scope: 'ItemController', repository, definitions });
        }
    downgrade:
      steps:
        - "Nothing to restore: a repository and a definitions object that fit the newer parameters fit the older any ones."
    data: "A repository whose own options narrow IExtraOptions in a way a method cannot accept bivariantly fails to type-check at the controller's constructor; the shipped repositories were checked."
  - id: query-operator-handler-types
    symbols: [TQueryOperatorHandlers, IQueryHandlerOptions]
    upgrade:
      before: |
        const handlers: TQueryOperatorHandlers = {
          like: (opts: { column: any; value: any }) => sql`${opts.column} like ${opts.value}`,
        };
      after: |
        // column is Column | SQL and value is unknown: build the fragment with a template, or narrow the value.
        // A handler typed on IQueryHandlerOptions still fits.
        const handlers: TQueryOperatorHandlers = {
          like: (opts) => sql`${opts.column} like ${opts.value}`,
        };
    downgrade:
      steps:
        - "Type the handler's parameters as any again."
  - id: normalize-count-data-constraint
    symbols: [BaseRestController.normalizeCountData]
    upgrade:
      before: |
        this.normalizeCountData<ResponseSchema extends any>({ context, data });
      after: |
        // non-breaking: the ResponseSchema type argument has no constraint now
        this.normalizeCountData<ResponseSchema>({ context, data });
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
