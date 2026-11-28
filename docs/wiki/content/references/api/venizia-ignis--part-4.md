---
title: "@venizia/ignis (4 of 4)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (4 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 4 of 4 of [`@venizia/ignis`](/references/api/venizia-ignis).

## `TPolicyDefinitionCommonColumns`

*type*

Drizzle column set shared by every policy-definition table; `ExtraVariant` widens the allowed `variant` values and `Metadata` types the `metadata` column.

```ts
export type TPolicyDefinitionCommonColumns<ExtraVariant extends string = never, Metadata extends object = TSubsetGrantMetadata> = ReturnType<typeof buildCommonPolicyDefinitionColumns<ExtraVariant, Metadata>>;

/** Column shape is inferred, never hand-declared, so it can never drift from the `$type<>()` narrowing below. */
declare const buildCommonPolicyDefinitionColumns: <ExtraVariant extends string = never, Metadata extends object = TSubsetGrantMetadata>() => {
    metadata: import("drizzle-orm").$Type<import("drizzle-orm/pg-core").PgJsonbBuilderInitial<"metadata">, Metadata>;
    variant: import("drizzle-orm").NotNull<import("drizzle-orm").$Type<PgTextBuilderInitial<"variant", [string, ...string[]]>, "join_domain" | "assign_role" | "grant" | "role_inherits" | "domain_inherits" | "resource_inherits" | "action_inherits" | ExtraVariant>>;
    subjectType: import("drizzle-orm").NotNull<PgTextBuilderInitial<"subject_type", [string, ...string[]]>>;
    targetType: import("drizzle-orm").NotNull<PgTextBuilderInitial<"target_type", [string, ...string[]]>>;
    domainType: PgTextBuilderInitial<"domain_type", [string, ...string[]]>;
    action: PgTextBuilderInitial<"action", [string, ...string[]]>;
    effect: import("drizzle-orm").$Type<PgTextBuilderInitial<"effect", [string, ...string[]]>, TAuthorizationDecision>;
};
```

Source: `packages/core-server/src/components/auth/models/entities/columns.ts`

## `TPolicyDefinitionOptions`

*type*

Options of the policy-definition table builder; `idType` selects the key type and `extraVariants` declares app-defined variants.

```ts
export type TPolicyDefinitionOptions<ExtraVariant extends string = never> = {
    idType?: TIdSchemaType;
    /**
     * App-only edge kinds stored in this same table alongside IGNIS's seven (e.g. `merchant_role`).
     * `ScopedCasbinAdapter` never selects an undeclared variant - it is purely the consumer's data.
     * Pass as an inline array literal; the `const` type parameter below infers the literal union
     * from it without needing `as const`.
     */
    extraVariants?: ReadonlyArray<ExtraVariant>;
};
```

Source: `packages/core-server/src/components/auth/models/entities/policy-definition.model.ts`

## `TPolicyLineLoader`

*type*

Computes a user's policy lines on a cache miss - CasbinAuthorizationEnforcer wires this to its isolated-enforcer extraction (PolicyLineCodec.extractUserLines).

```ts
export type TPolicyLineLoader = (opts: {
    user: IAuthorizationUser;
}) => Promise<string[]>;
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/user-policy-line-cache.ts`

## `TPrincipalPolicyRow`

*type*

A row from the single principal-policy statement; `edge` says which branch produced it.

```ts
export type TPrincipalPolicyRow = TGrantRow & {
    edge: TConstValue<typeof PrincipalPolicyEdges>;
    variant: string;
    targetType: TNullable<string>;
    targetId: IdType;
};
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/policy-edges.ts`

## `TResolveDomainEdgesFn`

*type*

Per-principal domain edges sourced from business data the app already owns (e.g. a tenant
foreign key) - read live on every cache miss, never duplicated into `domain_inherits`. An app
whose hierarchy genuinely lives in `domain_inherits` rows does not need this hook at all: the
DOMAIN_EDGE branch above already emits those as `g3` lines. `domains` is the principal's own
domain closure, already `<Type>_<id>` tokens; the returned edges must be too - neither side
re-formats them.

`domains` is the principal's **membership closure** - built from `join_domain` rows plus both
ends of every `domainEdge` row. It is NOT the set of domains the principal holds a role in via
`assign_role`: a principal can carry `assign_role` at a domain it never joined. A hook ported
from a mechanism that derived its domains from `assign_role` will silently lose access for
exactly those principals - no error, no log, just fewer edges reaching `g`/`g2`/`g3` than before.

More than one hierarchy axis (e.g. an organizer tree and a separate region tree)? Write one
function per axis and concatenate their results here - this hook deliberately takes a single
function, so composition stays visible in the application, not hidden inside the framework:
`resolveDomainEdges: async opts => [...(await organizerEdges(opts)), ...(await regionEdges(opts))]`.

```ts
export type TResolveDomainEdgesFn = (opts: {
    principal: {
        type: string;
        id: IdType;
    };
    domains: string[];
}) => Promise<TDomainHierarchyEdge[]>;
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/common/types.ts`

## `TRpcHandler`

*type*

Typed handler signature for gRPC RPC methods. `rpc` is ConnectRPC's own context of the call: `signal` (aborted at the
deadline and when the client leaves; a handler that ignores it runs on), `timeoutMs()`, `requestHeader`,
`responseHeader` and `responseTrailer`.

```ts
export type TRpcHandler<RequestType = unknown, ResponseType = unknown, RouteEnv extends Env = Env> = (opts: {
    request: RequestType;
    context: TRouteContext<RouteEnv>;
    rpc: HandlerContext;
}) => ValueOrPromise<ResponseType>;
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `TRpcMiddleware`

*type*

Pre-built middleware function for gRPC auth enforcement.

```ts
export type TRpcMiddleware<RouteEnv extends Env = Env> = (context: TRouteContext<RouteEnv>, next: Next) => ValueOrPromise<void | Response>;
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `TServerBootStep`

*type*

Union of the step names in `ServerBootSteps`, accepted by `BootSequence.insertAfter` and `skipSteps`.

```ts
export type TServerBootStep = TConstValue<typeof ServerBootSteps>;
```

Source: `packages/core-server/src/base/applications/boot-steps.ts`

## `UIProviderFactory`

*class*

Process-wide registry of UI providers by type; obtain it with `getInstance()`. `register` creates the built-in `swagger` and `scalar` providers and throws for any other type.

```ts
export declare class UIProviderFactory extends MemoryStorageHelper<{
    [key: string | symbol]: IUIProvider;
}> {
    private static instance;
    static getInstance(): UIProviderFactory;
    getProvider({ type }: IGetProviderParams): IUIProvider;
    register(opts: {
        type: string;
    }): void;
    getRegisteredProviders(): (string | number | symbol)[];
}
```

Source: `packages/core-server/src/components/api-reference/ui/factory.ts`

## `useRequestContext`

*const*

Returns the Hono context of the request being handled, or `undefined` outside a request (uses `tryGetContext`, so it never throws).

```ts
export declare const useRequestContext: <AppEnv extends Env = Env>() => import("hono").Context<AppEnv, any, {}> | undefined;
```

Source: `packages/core-server/src/base/metadata/request-context.ts`

## `UserPolicyLineCache`

*class*

Per-user redis cache of casbin policy lines. Owns the cache key, the TTL, and concurrent-miss
de-duplication so N simultaneous misses for the same user collapse onto one extraction.

```ts
export declare class UserPolicyLineCache extends BaseHelper {
    private readonly cached;
    private readonly loadLines;
    private readonly pendingLineFetches;
    constructor(opts: {
        cached: ICasbinEnforcerCachedRedis & {
            use: true;
        };
        loadLines: TPolicyLineLoader;
    });
    /** Fetch the user's lines, collapsing concurrent misses per key onto one extraction. Best-effort: two misses may race past the cache read and both extract (benign - per-user lines are identical). */
    fetch(opts: {
        user: IAuthorizationUser;
    }): Promise<string[]>;
    /** Drop the user's cached entry. */
    invalidate(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        invalidatedKeys: number;
    }>;
    /** Drop then recompute the user's cached entry via `loadLines` - an isolated extraction (never a pooled serving enforcer), so a concurrent request cannot make the cache hold another user's lines. */
    rebuild(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        lines: string[];
    }>;
    /** Compute the user's cache key and reject an empty result - consistent with the read path. */
    private resolveCacheKey;
    /** Single source of truth for the cache encoding. Used by the miss path and rebuild(). */
    private writeLines;
    /** Decode cached policy lines; on any corruption, log and return null so the caller refetches. */
    private parseLines;
}
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/user-policy-line-cache.ts`
