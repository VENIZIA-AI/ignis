---
title: "@venizia/ignis-kernel (9 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (9 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 9 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `TRepositoryOperationScope`

*type*

Valid repository operation scope values.

```ts
export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRepositoryPersistObject`

*type*

Persist object of a repository, from its `$inferPersist` phantom marker; same contract and `object` fallback as {@link TRepositoryDataObject}.

```ts
export type TRepositoryPersistObject<Repository> = Repository extends {
    $inferPersist?: infer TPersist;
} ? TPersist extends object ? TPersist : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TRequestContextResolver`

*type*

Reads the host's ambient request context, synchronously. `undefined` means THERE IS NO REQUEST
CONTEXT - a distinct state from a context that carries no user, and callers act on the difference.

```ts
export type TRequestContextResolver = () => Context | undefined;
```

Source: `packages/kernel/src/base/request-context/common/types.ts`

## `TResponseExtra`

*type*

A figure a list route offers beside its rows:
- a function runs when the client names it;
- `{ isDefault: true, compute }` always runs, unless the client switches it off with `-name`;
- `{ keys, compute }` is a group - the client names the keys it wants (`facets(status,tag)`), and
  `compute` receives exactly those, so one aggregate pass serves them all.

```ts
export type TResponseExtra = (() => ValueOrPromise<unknown>) | {
    isDefault: boolean;
    compute: () => ValueOrPromise<unknown>;
    keys?: never;
} | {
    keys: ReadonlyArray<string>;
    compute: (opts: {
        keys: Array<string>;
    }) => ValueOrPromise<unknown>;
    isDefault?: never;
};
```

Source: `packages/kernel/src/base/controllers/rest/extras.ts`

## `TResponseFormat`

*type*

Union of the `ResponseFormats` values.

```ts
export type TResponseFormat = TConstValue<typeof ResponseFormats>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TResponseHeaderObject`

*type*

OpenAPI response header object

```ts
export type TResponseHeaderObject = {
    description?: string;
    schema: {
        type: 'string';
        examples?: string[];
    };
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TResponseHeaders`

*type*

OpenAPI response headers format

```ts
export type TResponseHeaders = Record<string, TResponseHeaderObject>;
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthConfig`

*type*

Per-route auth config. Endpoint config takes precedence over controller-level config.

```ts
export type TRouteAuthConfig = {
    authenticate?: TRouteAuthenticateConfig;
    authorize?: TRouteAuthorizeConfig;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthenticateConfig`

*type*

Per-route authentication config: { skip: true } or { strategies, mode }.

```ts
export type TRouteAuthenticateConfig = {
    skip: true;
} | {
    skip?: false;
    strategies?: TAuthStrategy[];
    mode?: TAuthMode;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthorizeConfig`

*type*

Per-route authorization config: { skip: true }, single spec, or array of specs.

```ts
export type TRouteAuthorizeConfig = {
    skip: true;
} | IAuthorizationSpec | IAuthorizationSpec[];
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteContext`

*type*

The context of a route whose config is not named: `req.valid()` answers the type you give it, else `unknown`.

```ts
export type TRouteContext<RouteEnv extends Env = Env> = TContextOf<IAuthRouteConfig, RouteEnv>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TRouteHandler`

*type*

A handler of a route whose config is not named.

```ts
export type TRouteHandler<RouteEnv extends Env = Env> = (context: TRouteContext<RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TRoutePathScope`

*type*

Valid route path scope values.

```ts
export type TRoutePathScope = TConstValue<typeof RoutePathScopes>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TScopeFilterMissingBehavior`

*type*

Valid scope-filter missing-behavior values.

```ts
export type TScopeFilterMissingBehavior = TConstValue<typeof ScopeFilterMissingBehaviors>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeOperation`

*type*

The four concrete operations: what `access.resolve` receives. Never WRITE or ALL.

```ts
export type TScopeOperation = typeof ScopeOperations.READ | typeof ScopeOperations.CREATE | typeof ScopeOperations.UPDATE | typeof ScopeOperations.DELETE;

/**
 * What a repository call does to rows, as the row scope (`@model` settings.access) sees it.
 * `access.resolve` receives one CONCRETE operation (READ, CREATE, UPDATE or DELETE), never a group,
 * so one function can answer a wide scope for a read and a narrow one for a write. WRITE and ALL
 * are groups of concrete operations, for application code that asks "is this a write?".
 */
export declare class ScopeOperations {
    static readonly READ = "read";
    static readonly CREATE = "create";
    static readonly UPDATE = "update";
    static readonly DELETE = "delete";
    /** CREATE, UPDATE and DELETE. */
    static readonly WRITE = "write";
    /** Every concrete operation. */
    static readonly ALL = "all";
    /** All six values: the four concrete operations and the two groups. */
    static readonly SCHEME_SET: Set<string>;
    /** The concrete operations: what `access.resolve` can receive. */
    static readonly OPERATION_SET: Set<string>;
    /** Which concrete operations each group holds. */
    static readonly GROUP_MAP: ReadonlyMap<string, ReadonlySet<string>>;
    static isValid(value: string): boolean;
    /**
     * Whether `operation` belongs to `group`. A concrete operation includes itself and nothing else;
     * WRITE includes CREATE, UPDATE and DELETE; ALL includes all four.
     */
    static includes(opts: {
        group: TScopeOperationGroup;
        operation: TScopeOperation;
    }): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeOperationGroup`

*type*

All six values: a concrete operation or a group. What `ScopeOperations.includes` takes as its group.

```ts
export type TScopeOperationGroup = TConstValue<typeof ScopeOperations>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeWriteGuard`

*type*

Valid scope write-guard values.

```ts
export type TScopeWriteGuard = TConstValue<typeof ScopeWriteGuards>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TSearchErrorCode`

*type*

Valid `SearchErrorCodes` values.

```ts
export type TSearchErrorCode = TConstValue<typeof SearchErrorCodes>;
```

Source: `packages/kernel/src/common/error-codes.ts`

## `TSecFetchSite`

*type*

One value of the `Sec-Fetch-Site` header, taken from `SecFetchSiteValues`.

```ts
export type TSecFetchSite = (typeof SecFetchSiteValues)[number];
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TServiceCallerEntry`

*type*

One entry in the caller allowlist: the JWKS url, or that url plus settings for this caller alone.

```ts
export type TServiceCallerEntry = string | {
    jwksUrl: string;
    /** Widens the accepted age for THIS caller only. Falls back to the service-wide setting. */
    acceptMaxAgeSeconds?: number;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/service.ts`

## `TSignInRequest`

*type*

Parsed body of `SignInRequestSchema`.

```ts
export type TSignInRequest = z.infer<typeof SignInRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-in.schema.ts`

## `TSignUpRequest`

*type*

Parsed body of `SignUpRequestSchema`.

```ts
export type TSignUpRequest = z.infer<typeof SignUpRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-up.schema.ts`

## `TSubsetGrantMetadata`

*type*

What IGNIS itself stores in `PolicyDefinition.metadata`: the operations of a subset grant, read
back by `ScopedCasbinAdapter` through `parseCustomGrantMetadata`. An application whose own
metadata has a different shape points the adapter at a different column
(`entities.policyDefinition.metadata.columnName`) rather than widening this one.

Declared here, beside the only writer, so the column type and the row type cannot drift.

```ts
export type TSubsetGrantMetadata = {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts`

## `TToggle`

*type*

A feature that is on or off. `{ use: false }` is the whole off state; `{ use: true, ... }` carries
the options. One shape for every switch, so an option is never read from a feature that is off.
Shared by components and controllers.

```ts
export type TToggle<Options extends object = Record<never, never>> = {
    use: false;
} | ({
    use: true;
} & Options);
```

Source: `packages/kernel/src/utilities/toggle.utility.ts`

## `TUpdateData`

*type*

Update data supporting both regular fields and JSON path updates via dot notation.

```ts
export type TUpdateData<T = object> = Partial<T> & {
    [jsonPath: string]: unknown;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `unary`

*const*

Unary RPC decorator. Equivalent to @rpc but automatically sets method to 'unary'.

```ts
export declare const unary: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `UserStatuses`

*class*

User statuses.

```ts
export declare class UserStatuses extends CommonStatuses {
}
```

Source: `packages/kernel/src/common/statuses/user.ts`

## `UserTypes`

*class*

User types within the application.

```ts
export declare class UserTypes extends ConstClass {
    static readonly SYSTEM = "SYSTEM";
    static readonly LINKED = "LINKED";
}
```

Source: `packages/kernel/src/common/statuses/user.ts`

## `WhereQuerySchema`

*const*

The query shape of a route that accepts conditions and nothing else - `count` and anything shaped
like it. `where` is OPTIONAL here.

`updateBy` and `deleteBy` deliberately do not use this. Their `where` is optional in the query
because it may ride in the body instead; the handler refuses a request that carries it in neither
place - a missing one there rewrites or deletes every row in the table.

```ts
export declare const WhereQuerySchema: z.ZodObject<{
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `WhereSchema`

*const*

Query conditions, with nested AND/OR.

```ts
export declare const WhereSchema: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`
