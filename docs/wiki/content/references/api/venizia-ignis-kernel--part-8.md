---
title: "@venizia/ignis-kernel (8 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (8 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 8 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `ScopeThrough`

*class*

The value of `settings.access.through`: scope this model through the parent a `one` relation points at. `of` is the
only way to make one: the constructor is private and the class has a member no plain object has, so a hand-written
`{ relation: 'x' }` does not compile and the name is always checked against the entity.

````ts
export declare class ScopeThrough<RelationName extends string = string> {
    readonly relation: RelationName;
    protected readonly brand = "scope-through";
    private constructor();
    /**
     * `entity` is read for its type only: a misspelled relation, a to-many one or a name held in a plain `string` does not compile.
     *
     * @example
     * ```typescript
     * import { ScopeThrough } from '@venizia/ignis';
     * import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
     *
     * const productTable = pgTable('Product', { id: serial('id').primaryKey() });
     * const variantTable = pgTable('Variant', {
     *   id: serial('id').primaryKey(),
     *   productId: integer('product_id').references(() => productTable.id),
     * });
     * const Variant = ModelFactory.defineEntity({ table: variantTable, relations: () => ({ product: one(productTable) }) });
     * const through = ScopeThrough.of({ entity: Variant, relation: 'product' });
     * ```
     */
    static of<Entity extends IEntityWithRelations, Name extends TOneRelationNameOf<Entity>>(opts: {
        entity: Entity;
        relation: Name;
    }): ScopeThrough<Name>;
}

/** An entity class that declares its relations by name, as `ModelFactory.defineEntity` builds one. */
interface IEntityWithRelations {
    relationDefinitions: Record<string, {
        type: string;
    }> | undefined;
}
````

Source: `packages/kernel/src/base/repositories/common/scope-through.ts`

## `ScopeWriteGuards`

*class*

What a scoped write does with a row whose scope column disagrees with the resolved scope
(`@model` settings.access.write.mode). A scope that returns `ScopeFilters.UNRESTRICTED`
passes either way.

```ts
export declare class ScopeWriteGuards extends ConstClass {
    /** A row whose scope column disagrees, or is absent on create, is refused and nothing is written. */
    static readonly REJECT = "reject";
    /** An ABSENT scope column is filled from an equality scope; a value that disagrees is still refused. */
    static readonly ASSIGN = "assign";
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `SecFetchSiteValues`

*const*

The values of the `Sec-Fetch-Site` request header, the vocabulary of `TSecFetchSite`.

```ts
export declare const SecFetchSiteValues: readonly ["same-origin", "same-site", "none", "cross-site"];
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `serverStream`

*const*

Server streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'server_streaming'.

```ts
export declare const serverStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `ServiceAssertion`

*class*

Wire-level constants of the service assertion. Fixed rather than configurable: both ends of a
call must agree on them, and a knob here would let two services disagree silently.

```ts
export declare class ServiceAssertion {
    /** Its own header, so the end user's token keeps `Authorization` on the same request. */
    static readonly HEADER = "x-service-assertion";
    /** The JWS `typ`. What stops a user token being replayed as an assertion when one JWKS serves both. */
    static readonly TYP = "svc+jwt";
    static readonly ALGORITHM = "EdDSA";
    static readonly DEFAULT_REST_PATH = "/svc-certs";
    /** How long a minted assertion stays valid. */
    static readonly DEFAULT_SIGN_LIFETIME_SECONDS = 60;
    /** The oldest assertion a callee accepts, measured from `iat`. Its own decision, not the caller's. */
    static readonly DEFAULT_ACCEPT_MAX_AGE_SECONDS = 60;
    static readonly DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;
    /** Resolves the accepted age for one caller: its own override, then the service default. */
    static resolveAcceptMaxAge(opts: {
        callerOverride?: number;
        serviceDefault?: number;
    }): number;
    static readonly DEFAULT_JWKS_CACHE_MAX_AGE_MS: number;
    static readonly DEFAULT_JWKS_COOLDOWN_MS: number;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/service-assertion.ts`

## `SignInRequestSchema`

*const*

Validates a sign-in body: an `identifier` and a `credential`, each a `scheme` plus `value`, and an optional `clientId`.

```ts
export declare const SignInRequestSchema: z.ZodObject<{
    identifier: z.ZodObject<{
        scheme: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>;
    credential: z.ZodObject<{
        scheme: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-in.schema.ts`

## `SignUpRequestSchema`

*const*

Validates a sign-up body: `username` and `credential`, each a non-empty string of at least 8 characters.

```ts
export declare const SignUpRequestSchema: z.ZodObject<{
    username: z.ZodString;
    credential: z.ZodString;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-up.schema.ts`

## `SkipSchema`

*const*

Number of rows to skip; a non-negative integer.

```ts
export declare const SkipSchema: z.ZodOptional<z.ZodNumber>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `StringIdType`

*type*

String entity id.

```ts
export type StringIdType = string;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `TAnyDataSourceSchema`

*type*

Loose schema record of a datasource; the default `Schema` type argument of `IDataSource`.

```ts
export type TAnyDataSourceSchema = Record<string, any>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TAnyObjectSchema`

*type*

Zod object type of a plain raw shape, used to type request and response schemas.

```ts
export type TAnyObjectSchema = z.ZodObject<z.ZodRawShape>;
```

Source: `packages/kernel/src/base/controllers/common/schema-builders.ts`

## `TArtifactCondition`

*type*

Decides at registration time whether the class is registered at all. Sync or async; runs before `preConfigure`, so it may read config and env, never another artifact's binding.

```ts
export type TArtifactCondition<ApplicationType = unknown> = (opts: {
    application: ApplicationType;
}) => ValueOrPromise<boolean>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TArtifactIndexField`

*type*

Union of the `ArtifactIndexFields` values.

```ts
export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `TArtifactIndexInput`

*type*

One index, a conditional entry, a group, or any nesting of arrays of them - a library exports one, an application composes several.

```ts
export type TArtifactIndexInput = IArtifactIndex | IConditionalArtifactIndex | IArtifactGroup | TArtifactIndexInput[];
```

Source: `packages/kernel/src/base/applications/common/types/artifacts.ts`

## `TArtifactType`

*type*

Valid `ArtifactTypes` values.

```ts
export type TArtifactType = TConstValue<typeof ArtifactTypes>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TAuthenticateFn`

*type*

Builds the authentication middleware for the listed strategy names.

```ts
export type TAuthenticateFn<RouteEnv extends Env = Env> = (opts: {
    strategies: string[];
    /** @default 'any' */
    mode?: TAuthMode;
}) => MiddlewareHandler<RouteEnv>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/strategy.ts`

## `TAuthenticationRestOptions`

*type*

REST options of the authenticate component: `controllerOpts` is required when `useAuthController` is `true`.

```ts
export type TAuthenticationRestOptions = {} & ({
    useAuthController?: false | undefined;
} | {
    useAuthController: true;
    controllerOpts: TDefineAuthControllerOpts;
});
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/rest.ts`

## `TAuthMode`

*type*

A valid value of `AuthenticationModes`.

```ts
export type TAuthMode = TConstValue<typeof AuthenticationModes>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `TAuthorizationAction`

*type*

Union of the `AuthorizationActions` values.

```ts
export type TAuthorizationAction = TConstValue<typeof AuthorizationActions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationConditions`

*type*

Key-value conditions for attribute-based access control. Values compared with strict equality.

```ts
export type TAuthorizationConditions<KeyType extends string | symbol = string | symbol, ValueType = string | number | boolean | null> = Record<KeyType, ValueType>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `TAuthorizationDecision`

*type*

Union of the `AuthorizationDecisions` values.

```ts
export type TAuthorizationDecision = TConstValue<typeof AuthorizationDecisions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationDomainResolver`

*type*

Returns the current request domain; null = no domain (→ SYSTEM_WIDE).

```ts
export type TAuthorizationDomainResolver<E extends Env = Env> = (opts: {
    context: TContext<E, string>;
}) => ValueOrPromise<TNullable<{
    type: string;
    id: IdType;
}>>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `TAuthorizationDomainScope`

*type*

Union of the `AuthorizationDomainScopes` values.

```ts
export type TAuthorizationDomainScope = TConstValue<typeof AuthorizationDomainScopes>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationDomainSource`

*type*

Valid authorization domain source values.

```ts
export type TAuthorizationDomainSource = TConstValue<typeof AuthorizationDomainSources>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationEnforcerType`

*type*

Union of the `AuthorizationEnforcerTypes` values.

```ts
export type TAuthorizationEnforcerType = TConstValue<typeof AuthorizationEnforcerTypes>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TAuthorizationPolicyVariant`

*type*

The `variant` column's full value set, derived from {@link AuthorizationPolicyVariants.ALL} - never hand-list the seven strings again.

```ts
export type TAuthorizationPolicyVariant = (typeof AuthorizationPolicyVariants.ALL)[number]['action'];

/** Edge kinds in the `PolicyDefinition` table (each row: subject -> target, `variant` = kind), carrying `action` (DB `variant` value) + `rule` (casbin prefix emitted per edge). Per-USER edges: GRANT, ASSIGN_ROLE, JOIN_DOMAIN; shared org-structure edges: the *_INHERITS ones. */
export declare class AuthorizationPolicyVariants {
    /** Give a Permission to a User/Role (row also carries action / effect / domain). casbin `p`: `p, <Role|User>_<id>, <domain>, <permissionCode>, <action>, <allow|deny>` */
    static readonly GRANT: {
        readonly action: "grant";
        readonly rule: "p";
    };
    /** Give a User a Role (optionally domain-scoped; no domain -> `*` = every domain). casbin `g`: `g, User_<id>, Role_<id>, <domain|*>` */
    static readonly ASSIGN_ROLE: {
        readonly action: "assign_role";
        readonly rule: "g";
    };
    /** A Role inherits another Role (DAG). Shares `g` with ASSIGN_ROLE so user -> role -> parent-role resolves in one lookup. Emitted with domain `*`: `g, Role_<child>, Role_<parent>, *` */
    static readonly ROLE_INHERITS: {
        readonly action: "role_inherits";
        readonly rule: "g";
    };
    /** User is a member of a Domain; powers the `ANY_MEMBER` grant scope via `g2(r.sub, r.dom)`. casbin `g2`: `g2, User_<id>, <Type>_<domainId>` */
    static readonly JOIN_DOMAIN: {
        readonly action: "join_domain";
        readonly rule: "g2";
    };
    /** DOMAIN axis (`dom`): domain nesting. Matcher: `g3(r.dom, p.dom)` + self-link so an exact domain always matches itself. casbin `g3`: `g3, <Type>_<childId>, <Type>_<parentId>` */
    static readonly DOMAIN_INHERITS: {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    };
    /** RESOURCE axis (`obj`), NON-standard nesting only - dotted nesting (`Order.findById ⊂ Order`) is handled by `objectMatch` WITHOUT an edge. Matcher: `objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)`, casbin `g4`: `g4, <childCode>, <parentCode>` */
    static readonly RESOURCE_INHERITS: {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    };
    /** ACTION axis (`act`): a narrow action covered by a broader one; no dotted shortcut, so it needs an explicit edge. Matcher: `g5(r.act, p.act)`, casbin `g5`: `g5, <childAction>, <parentAction>`. g4 + g5 combine multiplicatively: `manage Order` covers a `read OrderItem` request. */
    static readonly ACTION_INHERITS: {
        readonly action: "action_inherits";
        readonly rule: "g5";
    };
    /** Every edge kind, in declaration order - the one place the scheme sets and the `variant` column's literal type both derive from. */
    static readonly ALL: readonly [{
        readonly action: "grant";
        readonly rule: "p";
    }, {
        readonly action: "assign_role";
        readonly rule: "g";
    }, {
        readonly action: "role_inherits";
        readonly rule: "g";
    }, {
        readonly action: "join_domain";
        readonly rule: "g2";
    }, {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    }, {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    }, {
        readonly action: "action_inherits";
        readonly rule: "g5";
    }];
    static readonly ACTION_SCHEME_SET: Set<string>;
    static readonly RULE_SCHEME_SET: Set<string>;
    static isValidAction(input: string): boolean;
    static isValidRule(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationVoter`

*type*

Per-route check run before the enforcer. `deny` rejects the request, `allow` accepts it without consulting the enforcer, `abstain` passes to the next voter and then the enforcer.

```ts
export type TAuthorizationVoter<E extends Env = Env, TAction = string, TResource = string> = (opts: {
    user: IAuthUser;
    action: TAction;
    resource: TResource;
    context: TContext<E, string>;
}) => ValueOrPromise<TAuthorizationDecision>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `TAuthorizeFn`

*type*

Factory that turns an `IAuthorizationSpec` (and optional enforcer name) into a Hono middleware.

```ts
export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
    spec: IAuthorizationSpec<E, TAction, TResource>;
    enforcerName?: string;
}) => MiddlewareHandler;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `TAuthorizeModelFormat`

*type*

Valid authorize model format values.

```ts
export type TAuthorizeModelFormat = TConstValue<typeof AuthorizeModelFormats>;
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `TAuthStrategy`

*type*

A strategy name: a built-in from `AuthenticateStrategy` or any name an application registers.

```ts
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy> | (string & {});
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `TBasicTokenServiceOptions`

*type*

Options of the `basic` strategy.

```ts
export type TBasicTokenServiceOptions<E extends Env = Env> = {
    /** Callback to verify basic auth credentials. Returns IAuthUser if valid, null otherwise. */
    verifyCredentials: (opts: {
        credentials: {
            username: string;
            password: string;
        };
        context: TContext<E, string>;
    }) => Promise<IAuthUser | null>;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/basic.ts`

## `TBootStep`

*type*

Union of the step names in `BootSteps`.

```ts
export type TBootStep = TConstValue<typeof BootSteps>;
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `TCasbinDomainMatchingFunction`

*type*

Union of the `CasbinDomainMatchingFunctions` values.

```ts
export type TCasbinDomainMatchingFunction = TConstValue<typeof CasbinDomainMatchingFunctions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinEnforcerCachedDriver`

*type*

Union of the `CasbinEnforcerCachedDrivers` values.

```ts
export type TCasbinEnforcerCachedDriver = TConstValue<typeof CasbinEnforcerCachedDrivers>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinEnforcerModelDriver`

*type*

Union of the `CasbinEnforcerModelDrivers` values.

```ts
export type TCasbinEnforcerModelDriver = TConstValue<typeof CasbinEnforcerModelDrivers>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinRuleVariant`

*type*

Union of the `CasbinRuleVariants` values.

```ts
export type TCasbinRuleVariant = TConstValue<typeof CasbinRuleVariants>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TChangePasswordRequest`

*type*

Parsed body of `ChangePasswordRequestSchema`.

```ts
export type TChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/change-password.schema.ts`

## `TCompressEncoding`

*type*

Valid compress encoding values.

```ts
export type TCompressEncoding = TConstValue<typeof CompressEncodings>;
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `TContext`

*type*

Lightweight typed context that bypasses RouteHandler inference.

```ts
export type TContext<RouteEnv extends Env = Env, ValidTargetKey extends string = string, ResponseBody = unknown> = Omit<Context<RouteEnv>, 'req' | 'json'> & {
    req: Omit<Context<RouteEnv>['req'], 'valid'> & {
        valid<T = unknown>(target: ValidTargetKey): T;
    };
    json<TStatusCode extends ContentfulStatusCode = 200>(body: ResponseBody, status?: TStatusCode): TJsonResponse<ResponseBody, TStatusCode>;
};
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TContextOf`

*type*

The context of a handler of the route `RouteConfig`: `req.valid(target)` is typed from the config's request schemas,
and is `unknown` for a part the config does not declare. Write it where TypeScript cannot read the config itself,
as on a decorated method: `context: TContextOf<typeof Routes.CREATE>`.

```ts
export type TContextOf<RouteConfig extends object, RouteEnv extends Env = Env> = IRouteContext<RouteConfig, RouteEnv>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TControllerMetadata`

*type*

Metadata accepted by `@controller`, discriminated on `transport`.

```ts
export type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;
```

Source: `packages/kernel/src/helpers/inversion/common/types/controller.ts`

## `TControllerTransport`

*type*

Union of the `ControllerTransports` values.

```ts
export type TControllerTransport = TConstValue<typeof ControllerTransports>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TCoreErrorCode`

*type*

Valid `CoreErrorCodes` values.

```ts
export type TCoreErrorCode = TConstValue<typeof CoreErrorCodes>;
```

Source: `packages/kernel/src/common/error-codes.ts`

## `TCountResponse`

*type*

Polymorphic response body for endpoints honoring the `x-request-count-data` header - the count-wrapped `{ count, data }` or the raw payload; pass the unwrapped payload type as `T`.

```ts
export type TCountResponse<TData = unknown> = TData | {
    count: number;
    data: TData;
};
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TCrudRepositoryClass`

*type*

The repository classes a CRUD controller can be built over.

```ts
export type TCrudRepositoryClass = TClass<IRepository>;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TCrudRoutes`

*type*

The routes of a CRUD controller: only a listed route exists, as `true` (on, with its defaults) or a config
(on, with overrides). `restoreById` and `restoreBy` are listed only for a repository that has both methods.

```ts
export type TCrudRoutes<Repository extends object = TRestorableMethods> = {
    [Key in keyof ICustomizableRoutes]?: Key extends keyof TRestorableMethods ? Repository extends TRestorableMethods ? true | TCustomizableRouteConfig : never : true | TCustomizableRouteConfig;
};

/** The repository methods the restore routes call. */
type TRestorableMethods = {
    restoreById: unknown;
    restoreBy: unknown;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TCustomGrantMetadata`

*type*

Shape of `PolicyDefinition.metadata` on a subset ("custom") grant. `ops` holds bare method names (e.g. `"find"`), not full permission codes.

```ts
export type TCustomGrantMetadata = {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TCustomizableRouteConfig`

*type*

What a CRUD route lets a caller override: auth, the request schemas (params, query, body, headers) and the response schema and headers.

```ts
export type TCustomizableRouteConfig = TRouteAuthConfig & {
    request?: {
        params?: TAnyObjectSchema;
        query?: TAnyObjectSchema;
        body?: TAnyObjectSchema;
        headers?: TAnyObjectSchema;
    };
    response?: {
        schema?: z.ZodType;
        headers?: TResponseHeaders;
    };
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TDatabaseErrorCode`

*type*

Valid `DatabaseErrorCodes` values.

```ts
export type TDatabaseErrorCode = TConstValue<typeof DatabaseErrorCodes>;
```

Source: `packages/kernel/src/base/middlewares/app-error/definition.ts`

## `TDataSourceDriver`

*type*

A driver name: one of `DataSourceDrivers`, or any other string for an unlisted engine.

```ts
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDataSourceDriverClass`

*type*

A driver CLASS, named by `@datasource({ driver })`. The class reference is what pulls the peer
package into a bundle - a name string pulls nothing, and a bare side-effect import may be
dropped. Untyped because `IRelationalDriver` lives under `connectors/`, off-limits to `base/`.

```ts
export type TDataSourceDriverClass = TClass<unknown>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDataSourceOpenMode`

*type*

One of the {@link DataSourceOpenModes} values.

```ts
export type TDataSourceOpenMode = TConstValue<typeof DataSourceOpenModes>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDecoratorModelTarget`

*type*

Decorator target for model classes (supports both strongly typed and ClassDecorator patterns).

```ts
export type TDecoratorModelTarget<Model extends AbstractEntity = AbstractEntity> = TModelClass<Model> | (Function & IEntityStatics);
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TDecoratorTarget`

*type*

Decorator target for any constructable class (includes Function for ClassDecorator).

```ts
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TDefineAuthControllerOpts`

*type*

Options for defining the auth controller. `serviceKey` is the container key of the `IAuthService` it calls; each `payload` entry overrides the request or response schema of one route.

```ts
export type TDefineAuthControllerOpts = {
    restPath?: string;
    serviceKey: TBindingKey<IAuthService>;
    requireAuthenticatedSignUp?: boolean;
    payload?: {
        signIn?: {
            request: {
                schema: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        signUp?: {
            request: {
                schema: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        changePassword?: {
            request: {
                schema?: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        refreshToken?: {
            response: {
                schema: TAnyObjectSchema;
            };
        };
        getUserInformation?: {
            response: {
                schema: TAnyObjectSchema;
            };
        };
    };
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/rest.ts`

## `TDrizzleQueryOptions`

*type*

Options for Drizzle ORM query building, used internally by FilterBuilder.

```ts
export type TDrizzleQueryOptions = Partial<{
    limit: number;
    offset: number;
    orderBy: SQL[];
    where: SQL;
    with: Record<string, true | TDrizzleQueryOptions>;
    columns: Record<string, boolean>;
}>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TEntityDataObject`

*type*

Read object inferred from an entity's engine-neutral `$inferData` phantom marker - each family fills it with its own type, so the base layer needs no connector import; falls back to `object`.

```ts
export type TEntityDataObject<TEntity> = TEntity extends {
    $inferData?: infer TData;
} ? TData extends object ? TData : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TEntityId`

*type*

A string id a plain `string` cannot be assigned to, so passing a name, code or email where an id
belongs is a compile error. Opt a column in with `.$type<TEntityId>()`.

IT VALIDATES NOTHING. `toEntityId` is a cast with a non-empty check; the value is making the
laundering VISIBLE at each boundary, not proving the string is a real id.

The cost is not optional: Drizzle derives `$inferInsert` and `$inferSelect` from the same field,
so a branded column rejects every literal - `create({ data: { merchantId: 'M1' } })`, seeds,
fixtures, path params - until each converts. A union with `string` would restore those but makes
a plain `string` assignable again, which erases the whole guarantee. Measured, not assumed.

```ts
export type TEntityId = string & {
    readonly [entityIdBrand]: never;
};

declare const entityIdBrand: unique symbol;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `TEntityPersistObject`

*type*

Persist object inferred from an entity's engine-neutral `$inferPersist` phantom marker - same contract and `object` fallback as {@link TEntityDataObject}.

```ts
export type TEntityPersistObject<TEntity> = TEntity extends {
    $inferPersist?: infer TPersist;
} ? TPersist extends object ? TPersist : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TErrorLogFormatter`

*type*

How a thrown error is rendered into the log line. Must never throw - a throw inside the error handler turns a handled failure into an unhandled one.

```ts
export type TErrorLogFormatter = (opts: {
    error: unknown;
    messageCode?: string;
    extra?: unknown;
    includeStack?: boolean;
    maxStackFrames?: number;
}) => string;
```

Source: `packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`

## `TErrorOutput`

*type*

The error response body type inferred from `ErrorSchema`.

```ts
export type TErrorOutput = z.infer<typeof ErrorSchema>;
```

Source: `packages/kernel/src/base/models/common/schemas.ts`

## `TEventHandlerFunction`

*type*

A handler callback - synchronous or asynchronous, `EventBus` awaits either the same way.

```ts
export type TEventHandlerFunction<TPayload = unknown> = (opts: {
    event: IDomainEvent<TPayload>;
}) => ValueOrPromise<void>;
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `TEventHandlerReference`

*type*

The two shapes `EventBus.register`'s `handler` accepts, tagged by `type` so the caller states
which rather than the bus inferring it from whichever field is present. Only `BINDING_KEY` shares
`IEventHandler`'s rebind property; see its doc.

```ts
export type TEventHandlerReference<TPayload = unknown> = IEventHandlerBindingKeyReference | IEventHandlerFunctionReference<TPayload>;
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `TEventHandlerType`

*type*

Union of the `EventHandlerTypes` values.

```ts
export type TEventHandlerType = TConstValue<typeof EventHandlerTypes>;
```

Source: `packages/kernel/src/base/events/common/constants.ts`

## `TFindOneOptions`

*type*

Options for `findOne`/`findById` - the retry predicate sees `TNullable<R>`.

```ts
export type TFindOneOptions<TOptions extends IExtraOptions, R> = TOptions & IWithReadRetry<TNullable<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TFindOptions`

*type*

Options for `find` returning a plain array - the retry predicate sees `Array<R>`.

```ts
export type TFindOptions<TOptions extends IExtraOptions, R> = TOptions & {
    shouldQueryRange?: false;
} & IWithReadRetry<Array<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TFindRangeOptions`

*type*

Options for `find` with the range envelope - the retry predicate sees `{ data, range }`.

```ts
export type TFindRangeOptions<TOptions extends IExtraOptions, R> = TOptions & {
    shouldQueryRange: true;
} & IWithReadRetry<TDataWithRange<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TGetTokenExpiresFn`

*type*

Returns the lifetime of a token to issue, in seconds from now.

```ts
export type TGetTokenExpiresFn = () => ValueOrPromise<number>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TGrantIntent`

*type*

What a caller wants to grant: a whole `tier` action, or an explicit list of operation names (`ops`).

```ts
export type TGrantIntent = {
    tier: TAuthorizationAction;
} | {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TInferSchema`

*type*

The output type of a Zod schema `T`.

```ts
export type TInferSchema<T extends z.ZodType> = z.infer<T>;
```

Source: `packages/kernel/src/base/controllers/common/schema-builders.ts`

## `TInjected`

*type*

What each callback receives: the same names, holding the instances the container resolved.

```ts
export type TInjected<Inject extends TInjectMap> = {
    [Name in keyof Inject]: InstanceType<Inject[Name]>;
};
```

Source: `packages/kernel/src/base/controllers/factory/injection.ts`

## `TInjectMap`

*type*

What an options object declares: a name for each class its callbacks need. Classes only: a key or an optional dependency is not declared here.

```ts
export type TInjectMap = Record<string, TClass<object>>;
```

Source: `packages/kernel/src/base/controllers/factory/injection.ts`

## `TInjectOptions`

*type*

Either a binding key or the class bound under it - never both. The shape is inversion's; the
`registry` member is not, because this wrapper is the one that supplies it.

```ts
export type TInjectOptions = TWithoutRegistry<TCoreInjectOptions>;

/** Distributes over the union, so `key` and `target` stay mutually exclusive - a bare `Omit` collapses the two branches into one shape declaring both. */
type TWithoutRegistry<T> = T extends unknown ? Omit<T, 'registry'> : never;
```

Source: `packages/kernel/src/base/metadata/injectors.ts`

## `TIsAllowedOriginHandler`

*type*

Decides whether the request `Origin` is allowed for the CSRF check.

```ts
export type TIsAllowedOriginHandler = (origin: string, context: Context) => boolean;
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TIsAllowedSecFetchSiteHandler`

*type*

Decides whether the request `Sec-Fetch-Site` value is allowed for the CSRF check.

```ts
export type TIsAllowedSecFetchSiteHandler = (secFetchSite: TSecFetchSite, context: Context) => boolean;
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TJOSEStandard`

*type*

A valid value of `JOSEStandards`.

```ts
export type TJOSEStandard = TConstValue<typeof JOSEStandards>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJsonResponse`

*type*

A Hono JSON `Response` typed with its body and status code.

```ts
export type TJsonResponse<ResponseBody = unknown, ResponseStatusCode extends StatusCode = StatusCode> = Response & TypedResponse<ResponseBody, ResponseStatusCode, 'json'>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TJWKSAlgorithm`

*type*

Valid JWKS algorithm values.

```ts
export type TJWKSAlgorithm = TConstValue<typeof JWKSAlgorithms>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSKeyDriver`

*type*

A valid value of `JWKSKeyDrivers`.

```ts
export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSKeyFormat`

*type*

A valid value of `JWKSKeyFormats`.

```ts
export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSMode`

*type*

A valid value of `JWKSModes`.

```ts
export type TJWKSMode = TConstValue<typeof JWKSModes>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSTokenServiceOptions`

*type*

Options of the JWKS token service, selected by `mode`.

```ts
export type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TJWTTokenRole`

*type*

One role as a token carries it.

```ts
export type TJWTTokenRole = {
    id: IdType;
    identifier: string;
    priority: number;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TJWTTokenServiceOptions`

*type*

Options of the JWT token service, selected by `standard` (`JWS` or `JWKS`).

```ts
export type TJWTTokenServiceOptions = {
    standard: typeof JOSEStandards.JWS;
    options: IJWSTokenServiceOptions;
} | {
    standard: typeof JOSEStandards.JWKS;
    options: TJWKSTokenServiceOptions;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TLockConfig`

*type*

Configuration for row-level lock wait behavior. Mutually exclusive: use noWait OR skipLocked.

```ts
export type TLockConfig = {
    noWait: true;
    skipLocked?: undefined;
} | {
    noWait?: undefined;
    skipLocked: true;
} | {
    noWait?: undefined;
    skipLocked?: undefined;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TLockOptions`

*type*

Row-level locking options for read operations.

```ts
export type TLockOptions = {
    strength: TLockStrength;
    config?: TLockConfig;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TLockStrength`

*type*

Valid lock strength values.

```ts
export type TLockStrength = TConstValue<typeof LockStrengths>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TMixinOpts`

*type*

Options of the registration itself, never of the artifact - what the artifact needs goes on its class.

```ts
export type TMixinOpts<Options extends object = {}> = {
    binding?: {
        namespace: string;
        key: string;
    };
    /**
     * Matches `bind()`'s overwrite behavior; false makes a same-key re-registration throw. Unset, it
     * follows `bootChecks.binding.allowOverride`.
     *
     * @default true
     */
    allowOverride?: boolean;
    /** Options passed directly to `instance.configure(options)` during initialization. */
    options?: Options;
};
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `TModelAccessSettings`

*type*

The two shapes of `@model` settings.access: a resolver, or a `through`.

```ts
export type TModelAccessSettings = IModelAccessSettings | IModelAccessThroughSettings;
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TModelClass`

*type*

A model class together with its entity statics.

```ts
export type TModelClass<Model extends AbstractEntity = AbstractEntity> = TClass<Model> & IEntityStatics;
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TModelType`

*type*

Valid model type values.

```ts
export type TModelType = TConstValue<typeof ModelTypes>;
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `ToggleUtility`

*class*

Reads the `{ use }` switches a component or controller option is written with.

```ts
export declare class ToggleUtility {
    /** The only place a toggle's `use` is read. Narrowing here is what lets every caller reach the options without a cast. */
    static isUsed<Options extends object>(toggle: TToggle<Options> | undefined): toggle is Extract<TToggle<Options>, {
        use: true;
    }>;
    /** The options of a toggle that is on, without `use`; `undefined` when it is off or absent. */
    static pick<Options extends object>(toggle: TToggle<Options> | undefined): Omit<Extract<TToggle<Options>, {
        use: true;
    }>, 'use'> | undefined;
}
```

Source: `packages/kernel/src/utilities/toggle.utility.ts`

## `TOneRelationNameOf`

*type*

The names of the entity's `one` relations: the only ones a child can be scoped through. None, when it declares no relations.

```ts
export type TOneRelationNameOf<Entity extends IEntityWithRelations> = [
    TDefinitionsOf<Entity>
] extends [never] ? never : {
    [Name in keyof TDefinitionsOf<Entity> & string]: TDefinitionsOf<Entity>[Name]['type'] extends typeof RelationTypes.ONE ? Name : never;
}[keyof TDefinitionsOf<Entity> & string];

/** An entity class that declares its relations by name, as `ModelFactory.defineEntity` builds one. */
interface IEntityWithRelations {
    relationDefinitions: Record<string, {
        type: string;
    }> | undefined;
}

type TDefinitionsOf<Entity extends IEntityWithRelations> = NonNullable<Entity['relationDefinitions']>;
```

Source: `packages/kernel/src/base/repositories/common/scope-through.ts`

## `TOrigin`

*type*

Allowed origin for CORS: one origin, a list of origins, or a function that returns the origin to echo (or nothing to reject). A string or a list entry may be a subdomain wildcard such as `https://*.example.com`, or a pattern with `:*` for any port such as `http://localhost:*` or `https://*.example.com:*`: the scheme is matched exactly, so is the port unless it is `*`, the apex domain is not included by a subdomain wildcard, and the bare `'*'` still means any origin.

```ts
export type TOrigin = string | string[] | ((origin: string, c: Context) => TNullable<Promise<TNullable<string>> | string>);
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TPlannedGrantRow`

*type*

Per-operation rows carry `targetId` = the operation's code, not a database id; the consumer resolves codes to ids when persisting.

```ts
export type TPlannedGrantRow = ReturnType<typeof AuthorizationPolicyBuilder.grant> & {
    metadata?: {
        ops: string[];
    };
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TPolicyDomainInput`

*type*

A grant/assignment domain: a scope literal (`SYSTEM_WIDE`/`ANY_MEMBER`) or a typed domain entity.

```ts
export type TPolicyDomainInput = string | {
    type: string;
    id: IdType;
};
```

Source: `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts`

## `TQueryOperatorHandlers`

*type*

Operator-name to SQL-handler table a relational dialect translates with, so a second SQL engine swaps the whole table without touching the walk that reaches it.

```ts
export type TQueryOperatorHandlers = Record<string, (opts: IQueryHandlerOptions) => SQL | undefined>;
```

Source: `packages/kernel/src/base/repositories/common/types/query.ts`

## `TrackableHeadersSchema`

*const*

The zod-backed request schemas, kept apart from `constants.ts` ON PURPOSE. `z.object()` runs at
module load, so any bundle reaching this file carries the whole of zod. While these lived beside
`ControllerTransports`, which the container's controller mixin imports, importing `Container`
alone cost 437 KB - 423 KB of it zod - for a four-line const class.

```ts
export declare const TrackableHeadersSchema: z.ZodObject<{
    "x-request-id": z.ZodOptional<z.ZodString>;
    "x-request-channel": z.ZodOptional<z.ZodString>;
    "x-device-info": z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/controllers/common/schemas.ts`

## `TRegistryDescriptor`

*type*

A registered item: its class and the container that resolves it.

```ts
export type TRegistryDescriptor<TItem> = {
    container: Container;
    targetClass: TClass<TItem>;
};
```

Source: `packages/kernel/src/base/auth/base/abstract-auth-registry.ts`

## `TRelationBuilder`

*type*

Engine-neutral: the registry is shared across connectors, so each connector narrows at its own call site.

```ts
export type TRelationBuilder = (opts: {
    source: unknown;
    relations: unknown;
}) => {
    relations?: unknown;
} | undefined;
```

Source: `packages/kernel/src/helpers/inversion/common/relation-builder.ts`

## `TRelationType`

*type*

Valid relation type values.

```ts
export type TRelationType = TConstValue<typeof RelationTypes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRepositoryDataObject`

*type*

Read object of a repository, from its `$inferData` phantom marker (the `TDataObject` its `AbstractRepository` base declares); falls back to `object`.

```ts
export type TRepositoryDataObject<Repository> = Repository extends {
    $inferData?: infer TData;
} ? TData extends object ? TData : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TRepositoryErrorCode`

*type*

Valid repository error code values.

```ts
export type TRepositoryErrorCode = TConstValue<typeof RepositoryErrorCodes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRepositoryLogOptions`

*type*

Configuration for repository operation logging.

```ts
export type TRepositoryLogOptions = {
    use: boolean;
    level?: TLogLevel;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TRepositoryMetadata`

*type*

What `@repository` accepts, discriminated on `type`.

```ts
export type TRepositoryMetadata<Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource> = IRepositoryMetadata<Model, DataSource> | IRemoteRepositoryMetadata<DataSource>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`
