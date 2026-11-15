---
title: The kernel types stop defaulting to any
description: "The IAuthService request and response types default to Record<string, unknown>, TCrudRoutes and TResponseBodyOf are checked, the CRUD controllers take the repository with its default options, and a query operator handler takes IQueryHandlerOptions with an SQLWrapper column."
packages: ['@venizia/ignis-kernel']
migration:
  - id: auth-service-defaults-unknown
    symbols: [IAuthService]
    upgrade:
      before: |
        // the request and response type arguments defaulted to AnyObject: any key, any value, and an interface fit
        interface ISignInResult { token: string }
        interface IUserQuery { id: number }

        class MyAuthService implements IAuthService {
          async signIn(context: TContext, opts: TSignInRequest): Promise<ISignInResult> { /* ... */ } // TS2416 now
          async signUp(context: TContext, opts: TSignUpRequest) { /* ... */ }
          async changePassword(context: TContext, opts: TChangePasswordRequest) { /* ... */ }
          async getUserInformation(context: TContext, opts: IUserQuery) { /* ... */ } // TS2416 now
        }

        declare const service: IAuthService;
        await service.getUserInformation?.(context, userQuery); // userQuery: IUserQuery, TS2345 now
      after: |
        // the defaults are Record<string, unknown>, and an interface has no implicit index signature:
        // declare the shapes as type aliases (they have one), or name them as type arguments of IAuthService
        type TSignInResult = { token: string };
        type TUserQuery = { id: number };

        class MyAuthService implements IAuthService {
          async signIn(context: TContext, opts: TSignInRequest): Promise<TSignInResult> { /* ... */ }
          async signUp(context: TContext, opts: TSignUpRequest) { /* ... */ }
          async changePassword(context: TContext, opts: TChangePasswordRequest) { /* ... */ }
          async getUserInformation(context: TContext, opts: TUserQuery) { /* ... */ }
        }

        declare const service: IAuthService;
        declare const userQuery: TUserQuery;
        await service.getUserInformation?.(context, userQuery);
    downgrade:
      steps:
        - "Drop the type arguments or the aliases; the older defaults were any-valued records, so interfaces and every read compiled."
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
    data: "TCrudRoutes without a type argument still lists every route; the break comes from variance: a map typed for any repository (TCrudRoutes<any> before) was assignable to TCrudRoutes<NonRestorableRepository>, the new default is not. TResponseBodyOf is a fix for a route that mixes a JSON response with one without JSON content (a 200 body beside a 204): it used to give never and now gives the JSON body."
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
          // opts was { column: any; value: any }, and IQueryHandlerOptions.column was a Column
          byName: (opts) => sql`${sql.identifier(opts.column.name)} = ${opts.value}`,
          lengthIs: (opts) => sql`length(${opts.column}) = ${opts.value.length}`,
          startsWith: (opts) => like(opts.column, `${opts.value}%`),
        };
      after: |
        // opts.column is an SQLWrapper (a Column, or the raw #> extraction the JSON path passes) and opts.value is unknown:
        // pass the column to a template or an operator, and narrow the value. The like family (like, notLike, ilike,
        // notIlike) takes a Column, an SQL or an SQL.Aliased only: wrap the column in a template
        const handlers: TQueryOperatorHandlers = {
          lengthIs: (opts) =>
            typeof opts.value === 'string' ? sql`length(${opts.column}) = ${opts.value.length}` : undefined,
          startsWith: (opts) => like(sql`${opts.column}`, `${opts.value}%`),
        };
    downgrade:
      steps:
        - "Type the handler's parameters as any again."
    data: "A helper that takes the handler's column as Column | SQL (such as a Postgres array comparison) takes SQLWrapper now; every drizzle operator except the like family accepts it."
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

- **Auth.** The `IAuthService` request and response types default to `Record<string, unknown>`.
- **CRUD.** `TCrudRoutes` defaults to a repository with both restore methods; `TResponseBodyOf` reads the JSON schema through a helper; the CRUD controller constructors take the repository with its default options and `definitions` as `Record<string, IAuthRouteConfig>`.
- **Query operators.** `TQueryOperatorHandlers` is a plain function table over `IQueryHandlerOptions`, whose `column` is an `SQLWrapper` (a `Column` or the JSON-path extraction) and whose `value` is `unknown`.

## Who is affected

- **Code that implements `IAuthService` with interface request or response types or reads them untyped, types a route map as the bare `TCrudRoutes` against a specific repository, or writes its own operator handler (the like family needs its column wrapped).** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
interface ISignInResult { token: string }

class MyAuthService implements IAuthService {
  async signIn(context: TContext, opts: TSignInRequest): Promise<ISignInResult> { /* ... */ }
  /* signUp, changePassword */
}
```

**After:**

```typescript
type TSignInResult = { token: string };

class MyAuthService implements IAuthService {
  async signIn(context: TContext, opts: TSignInRequest): Promise<TSignInResult> { /* ... */ }
  /* signUp, changePassword */
}
```
