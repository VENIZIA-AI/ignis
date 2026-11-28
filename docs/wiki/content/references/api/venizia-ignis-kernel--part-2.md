---
title: "@venizia/ignis-kernel (2 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (2 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `AuthorizationPolicyVariants`

*class*

Edge kinds in the `PolicyDefinition` table (each row: subject -> target, `variant` = kind), carrying `action` (DB `variant` value) + `rule` (casbin prefix emitted per edge). Per-USER edges: GRANT, ASSIGN_ROLE, JOIN_DOMAIN; shared org-structure edges: the *_INHERITS ones.

```ts
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

## `AuthorizationProvider`

*class*

Provides the `TAuthorizeFn` that builds the per-route authorization middleware: skip flag, always-allow and allowed roles, voters, then the enforcer decision.

```ts
export declare class AuthorizationProvider extends BaseHelper implements IProvider<TAuthorizeFn> {
    constructor();
    /** Type guard, so it keeps its positional `user`. */
    private hasPrincipalType;
    value(): TAuthorizeFn;
    private createAuthorizeMiddleware;
    private extractUserRoles;
}
```

Source: `packages/kernel/src/base/auth/authorize/providers/authorization.provider.ts`

## `AuthorizationRole`

*class*

Role with a numeric priority. `identifier` is the zero-padded (3 digits) priority joined to the name by `delimiter`, e.g. `010_user`.

```ts
export declare class AuthorizationRole implements IAuthorizationRole {
    readonly name: string;
    readonly priority: number;
    /**
     * Joins the padded priority to the name in `identifier`.
     *
     * @default '_'
     */
    readonly delimiter: string;
    static build(opts: {
        name: string;
        priority: number;
        delimiter?: string;
    }): AuthorizationRole;
    constructor(opts: {
        name: string;
        priority: number;
        delimiter?: string;
    });
    get identifier(): string;
    compare(opts: {
        target: IAuthorizationRole;
    }): number;
    isHigherThan(opts: {
        target: IAuthorizationRole;
    }): boolean;
    isLowerThan(opts: {
        target: IAuthorizationRole;
    }): boolean;
    isEqualTo(opts: {
        target: IAuthorizationRole;
    }): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/models/authorization-role.model.ts`

## `AuthorizationRoles`

*class*

Built-in roles ordered by priority (`super-admin` 999, `admin` 900, `user` 10, `guest` 1, `unknown-user` 0). `SCHEME_SET` and `isValid` work on the role `identifier` (e.g. `010_user`), not the bare name.

```ts
export declare class AuthorizationRoles {
    static readonly SUPER_ADMIN: AuthorizationRole;
    static readonly ADMIN: AuthorizationRole;
    static readonly USER: AuthorizationRole;
    static readonly GUEST: AuthorizationRole;
    static readonly UNKNOWN_USER: AuthorizationRole;
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `authorize`

*const*

Builds the authorization middleware for a route from an `IAuthorizationSpec`; `enforcerName` selects a registered enforcer, else the default one is used.

```ts
export declare const authorize: (opts: {
    spec: IAuthorizationSpec;
    enforcerName?: string;
}) => import("hono").MiddlewareHandler;
```

Source: `packages/kernel/src/base/auth/authorize/middlewares/authorize.middleware.ts`

## `AuthorizeBindingKeys`

*class*

Container binding keys for the authorize options, the always-allow roles, and (through `enforcerOptions`) the options of one named enforcer.

```ts
export declare class AuthorizeBindingKeys {
    static readonly OPTIONS: TBindingKey<IAuthorizeOptions>;
    static readonly ALWAYS_ALLOW_ROLES: TBindingKey<string[]>;
    /** The options of the enforcer named `name`; their type is the enforcer's, so the caller names it: `enforcerOptions<ICasbinOptions>(name)`. */
    static enforcerOptions<T = unknown>(name: string): TBindingKey<T>;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/binding-keys.ts`

## `AuthorizeModelFormats`

*class*

The `format` of `getAuthorizeModelPrincipals` and `getAuthorizeModelSettings`: ARRAY or RECORD.

```ts
export declare class AuthorizeModelFormats extends ConstClass {
    static readonly ARRAY = "array";
    static readonly RECORD = "record";
}
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `BaseAppErrorMiddleware`

*class*

Hono `onError`: ZodError -> 422, DB client error -> 400, retryable conflict -> 409, `getError` ->
its own status, else 500. Browser-pure: the two reads that need a host - the ambient environment
name and the error formatter - are constructor OPTIONS, not methods to subclass.

They were hooks once, and three subclasses existed to answer them and nothing else. A class seam
is also unreachable from application code, so the browser example had to fake the environment with
a Hono middleware assigning `context.env`. `@venizia/ignis`'s `AppErrorMiddleware` now just
supplies `process.env.NODE_ENV` and `ErrorPrettier` as options.

```ts
export declare class BaseAppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
    private rootKey;
    private intentionalStackFrames;
    private unexpectedStackFrames;
    /**
     * How this host reads its ambient environment name, and the ONE option that says whether it has
     * one at all: absent means it does not (a browser), so an unresolved name is by design; present
     * but returning `undefined` means a host that should have one is misconfigured. Either way
     * {@link isProduction} fails closed.
     *
     * A function, not a string: `process.env.NODE_ENV` has to be read per request, since a test - and
     * a `--env-file` reload - can change it after the middleware is built.
     */
    private readonly environment?;
    /** Replaces {@link renderErrorForLog} - `@venizia/ignis` passes `ErrorPrettier`, which reaches `node:util` and so cannot live here. */
    private readonly formatErrorOverride?;
    constructor(opts?: {
        logger?: ILogger;
        rootKey?: string;
        intentionalStackFrames?: number;
        unexpectedStackFrames?: number;
        environment?: () => string | undefined;
        formatError?: TErrorLogFormatter;
    });
    /** Renders a thrown error for the log, through the `formatError` option when one was given. */
    protected formatError(opts: {
        error: unknown;
        messageCode?: string;
        extra?: unknown;
        includeStack?: boolean;
        maxStackFrames?: number;
    }): string;
    /**
     * The default log rendering: pure and deliberately small, so the whole middleware stays
     * browser-pure.
     *
     * Must never throw, cycles included: a throw inside the error handler turns a handled failure
     * into an unhandled one.
     */
    private renderErrorForLog;
    private withRootKey;
    /** Fail-closed: an unset or unrecognized env is production. */
    private isProduction;
    private classify;
    /** Hono's `HTTPException` carries `status`, not `statusCode`. Only a 4xx is the caller's fault; a 5xx stays unexpected, so its message is sanitized. */
    private readClientErrorStatus;
    /** `getError` sets `statusCode`, and it wins when a foreign error carries both. Anything but an integer from 400 to 599 is a 500. */
    private readIntentionalStatus;
    /** A throw site's own answer. A server error (5xx) in production keeps its status and code only: the message is for the log. */
    private resolveIntentional;
    /** A foreign error's own `messageCode`, else the default one. */
    private readMessageCode;
    /** An ApplicationError's `normalized` is authoritative - a `transform` may have reworded `text`. */
    private build;
    private resolve;
    /** A throw site may set `logLevel` via `getError`; anything unset or malformed logs at `error`. */
    private resolveLogLevel;
    /** The one place a thrown error reaches the log - called once the status is known, so it carries it. */
    private logError;
    /** Only an intentional error's message is a catalog template; every other branch writes its own text, so it passes through as is. */
    private renderMessage;
    /**
     * The `extra` a response carries. It is whatever a throw site attached, so it goes through the same redaction the log
     * line uses (always masking in production, whatever the logger switch says), and a server error (5xx) in production
     * carries none: the log has it, a client has no use for it.
     */
    private renderExtra;
    /**
     * What a production server error still carries from `extra`: the correlation ids support needs, `requestId` and
     * `upstreamRequestIds`, and nothing else. Only short strings count (a list of them for the chain), so the allowance
     * cannot carry anything but an id.
     */
    private pickCorrelationIds;
    /** The `args` a throw site passes to its message template are data the client may see; secret-shaped keys in them are masked in production, whatever the logger switch says. */
    private renderNormalized;
    value(): ErrorHandler;
}
```

Source: `packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`

## `BaseComponent`

*class*

Base of every component: `configure()` stores the options once, then runs `binding()` to register the component bindings. A second `configure()` call is a no-op.

```ts
export declare abstract class BaseComponent<ConfigurableOptions extends object = {}> extends BaseHelper implements IConfigurable<ConfigurableOptions> {
    protected bindings: Record<string, Binding>;
    protected initDefault: TInitDefault;
    protected isConfigured: boolean;
    /** What `application.component(Ctor, { options })` handed this instance, set before `binding()` runs. Optional, not defaulted to `{}`: a component registered through `configs.artifacts` gets no options and uses `??` to fall back to its binding, which an empty object would silently defeat. */
    options?: ConfigurableOptions;
    constructor(opts: {
        scope: string;
        initDefault?: TInitDefault;
        bindings?: Record<string, Binding>;
    });
    abstract binding(): ValueOrPromise<void>;
    /** Override this, not the field, to resolve options lazily. */
    getOptions(): ConfigurableOptions | undefined;
    protected initDefaultBindings(opts: {
        container: Container;
    }): void;
    configure(opts?: ConfigurableOptions): Promise<void>;
}

type TInitDefault = {
    enable: false;
} | {
    enable: true;
    container: Container;
};
```

Source: `packages/kernel/src/base/components/base.ts`

## `BaseConfiguration`

*class*

Base of every configuration artifact: `configure()` runs `setup()` once and ignores later calls.

```ts
export declare abstract class BaseConfiguration<ConfigurableOptions extends object = {}> extends BaseHelper implements IConfiguration, IConfigurable<ConfigurableOptions> {
    protected isConfigured: boolean;
    constructor(opts?: {
        scope?: string;
        identifier?: string;
    });
    configure(opts?: ConfigurableOptions): Promise<void>;
    /** Override to perform setup work when the configuration is booted. */
    protected setup(_opts?: ConfigurableOptions): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/configurations/base.ts`

## `BaseProvider`

*class*

Base class for a provider: `value(container)` computes the value the provider supplies, using the container to resolve its dependencies.

```ts
export declare abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
    abstract value(container: Container): T;
}
```

Source: `packages/kernel/src/base/providers/base.ts`

## `BaseRestController`

*class*

Recommended base class for REST controllers with concrete bindRoute and defineRoute implementations.

```ts
export declare abstract class BaseRestController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>> extends AbstractRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions, Definitions> {
    /** Runs a handler task under performance measurement (fixed logger/level/description). */
    measure<R>(opts: {
        scope: string;
        args: unknown;
        task: () => Promise<R>;
    }): Promise<R>;
    /** Returns the full `{ count, data }` envelope, or just `data` when the client sent `x-request-count: false`; `X-Response-Count` is set either way. */
    normalizeCountData<ResponseSchema, RequestContext extends TRouteContext<RouteEnv> = TRouteContext<RouteEnv>, ResponseData extends {
        count: number;
        data?: TNullable<ResponseSchema>;
    } = {
        count: number;
        data?: TNullable<ResponseSchema>;
    }>(opts: {
        context: RequestContext;
        payload: ResponseData;
    }): TNullable<ResponseSchema> | ResponseData;
    /** `x-request-extra`, parsed: `name`, `-name` (a default switched off) and `name(key,key)`. */
    getRequestedExtras(opts: {
        context: TRouteContext<RouteEnv>;
    }): Array<IRequestedExtra>;
    /**
     * The one response call. Sets `X-Response-Format`, and with `range` (a list) also `Content-Range` -
     * `payload.count` is the rows of THIS response, never the total - then normalizes count/data per
     * the request-count header.
     *
     * `extra` offers figures beside the rows (see {@link TResponseExtra}): each runs when the client
     * names it in `x-request-extra`, or always when it is a default. When any runs, the body is
     * `{ data, extra }` (with `count` when it is requested); when none does, nothing is computed and the
     * body is what it would be without `extra`. A name the route does not offer is a 400 listing the
     * ones it does.
     */
    respond<R>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra?: never;
    }): TNullable<R | {
        count: number;
        data?: TNullable<R>;
    }>;
    respond<R, Extra extends Record<string, TResponseExtra>>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra: Extra;
    }): Promise<TNullable<R | {
        count: number;
        data?: TNullable<R>;
    } | {
        count?: number;
        data?: TNullable<R>;
        extra: Partial<Record<keyof Extra, unknown>>;
    }>>;
    respond<R>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra?: Record<string, TResponseExtra>;
    }): ValueOrPromise<TNullable<R | {
        count?: number;
        data?: TNullable<R>;
        extra?: Record<string, unknown>;
    }>>;
    /** The `extra` half of `respond`: resolves what was asked against what is offered, runs it in parallel. */
    respondWithExtra<R>(opts: {
        context: TRouteContext<RouteEnv>;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        extra: Record<string, TResponseExtra>;
    }): Promise<R | {
        count: number;
        data?: TNullable<R>;
    } | {
        count: number;
        data: TNullable<R>;
        extra: Record<string, unknown>;
    } | {
        data: TNullable<R>;
        extra: Record<string, unknown>;
        count?: undefined;
    } | null | undefined>;
    /** The list headers without the body, for a list whose body is not a `{ count, data }` envelope: `Content-Range`, `X-Response-Count` = rows in THIS response, `X-Response-Format: array`. Pass a `range`, or `offset` + `total` for an engine that reports those (a search page): the range is derived with the same inclusive-end rule. */
    setListHeaders(opts: {
        context: TRouteContext<RouteEnv>;
        count: number;
    } & ({
        range: TDataRange;
    } | {
        offset: number;
        total: number;
    })): void;
    /** A route handler's context is a lightweight custom shape (different `json`/`req.valid` signatures) built on Hono's real Context, not a subtype of the RouteHandler `.openapi()` expects - genuinely different handler types bridged here. */
    toHonoHandler<RouteConfig extends IAuthRouteConfig = IAuthRouteConfig>(opts: {
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
    }): Parameters<OpenAPIHono<RouteEnv>["openapi"]>[1];
    /** Creates a fluent binding for registering a route (call .to() to attach handler). */
    bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines and registers a route with its handler in a single call. */
    defineRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines a JSX route that renders server-side HTML via c.html(). */
    defineJSXRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/rest/base.ts`

## `BaseService`

*class*

Base class for services; `scope` names the logger scope.

```ts
export declare abstract class BaseService extends BaseHelper implements IService {
    constructor(opts: {
        scope: string;
        identifier?: string;
    });
}
```

Source: `packages/kernel/src/base/services/base.ts`

## `bidiStream`

*const*

Bidirectional streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'bidi_streaming'.

```ts
export declare const bidiStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `BigIntIdType`

*type*

Bigint entity id.

```ts
export type BigIntIdType = bigint;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `BodyLimits`

*class*

The request body limit: the default every route gets, and the limit one route sets for itself.

The application installs the default (`DEFAULT_MAX_SIZE`) ahead of every other middleware, so no route reads
a body over it. A route that takes larger bodies (an upload, an import) puts `BodyLimits.route({ maxSize })`
in its `middleware`: the default steps aside for that route and this limit answers instead. The limit counts
the bytes that arrive, so a chunked body with no `Content-Length` is held to it too.

```ts
export declare class BodyLimits {
    /** The default of every route: 5 MiB. */
    static readonly DEFAULT_MAX_SIZE: number;
    /** The limiter itself: a body over `maxSize` bytes is the framework's 413, or the `onError` answer. */
    static limiter(opts: {
        maxSize: number;
        onError?: (context: Context) => Response | Promise<Response>;
    }): MiddlewareHandler;
    /**
     * The limit of one route, to put in the route's `middleware`. It replaces the default for this route, larger or smaller.
     * A body larger than the host accepts at all (`configs.server.maxRequestBodySize`, Bun's own cap) is still refused there.
     */
    static route(opts: {
        maxSize: number;
        onError?: (context: Context) => Response | Promise<Response>;
    }): MiddlewareHandler;
    /**
     * The marker of a route that reads its body itself: the limit of every route steps aside and no framework middleware
     * reads the body first. It limits NOTHING: the route's handler must bound what it reads (an RPC route bounds each
     * message). The host's own cap (`configs.server.maxRequestBodySize`) still holds.
     */
    static stream(): MiddlewareHandler;
    /** Whether the route this request matched reads its body itself (`BodyLimits.stream`). */
    static isStreamed(context: Context): boolean;
    /** Whether the route this request matched carries its own limit, so the default stands aside. */
    static hasRouteLimit(context: Context): boolean;
}
```

Source: `packages/kernel/src/base/applications/body-limit.ts`

## `BootSequence`

*class*

Composes a boot sequence by name instead of copying the array - a subclass reads exactly what it adds by reading its own override, without diffing two files by eye.

```ts
export declare class BootSequence {
    /** A duplicated name is refused as loudly as a missing one - picking the first match would splice a step into the wrong place silently. */
    private static indexOf;
    static insertAfter(opts: {
        steps: IBootSequenceStep[];
        target: string;
        step: IBootSequenceStep;
    }): IBootSequenceStep[];
}
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `BootSteps`

*class*

The step names the kernel defines - the vocabulary a subclass targets with `BootSequence.insertAfter`. A server application adds its own on top (`ServerBootSteps` in `@venizia/ignis`).

```ts
export declare class BootSteps extends ConstClass {
    static readonly STATIC_CONFIGURE = "staticConfigure";
    static readonly REGISTER_ARTIFACTS = "registerArtifacts";
    static readonly PRE_CONFIGURE = "preConfigure";
    static readonly REGISTER_DEFAULT_MIDDLEWARES = "registerDefaultMiddlewares";
    static readonly REGISTER_CONFIGURATIONS = "registerConfigurations";
    static readonly REGISTER_DATA_SOURCES = "registerDataSources";
    static readonly REGISTER_COMPONENTS = "registerComponents";
    static readonly REGISTER_CONTRIBUTED_DATA_SOURCES = "registerContributedDataSources";
    static readonly REGISTER_CONTROLLERS = "registerControllers";
    static readonly POST_CONFIGURE = "postConfigure";
    static readonly VERIFY_BINDINGS = "verifyBindings";
}
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `CasbinDomainMatchingFunctions`

*class*

Casbin matching functions selectable for the domain match in `ICasbinEnforcerOptions.domainMatching`.

```ts
export declare class CasbinDomainMatchingFunctions extends ConstClass {
    /** `*` is the only wildcard; exact compare otherwise. Safest for `Merchant_<uuid>` domains. */
    static readonly KEY_MATCH = "keyMatch";
    /** Adds URL-path `:param` segment matching. */
    static readonly KEY_MATCH_2 = "keyMatch2";
    /** Adds `{param}` segment matching. */
    static readonly KEY_MATCH_3 = "keyMatch3";
    /** `{param}` matching with repeated-name equality checks. */
    static readonly KEY_MATCH_4 = "keyMatch4";
    /** Treats the stored/policy value as a full regular expression. */
    static readonly REGEX_MATCH = "regexMatch";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinEnforcerCachedDrivers`

*class*

Cache backends for a Casbin enforcer's per-user policy lines.

```ts
export declare class CasbinEnforcerCachedDrivers extends ConstClass {
    static readonly REDIS = "redis";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinEnforcerModelDrivers`

*class*

Where a Casbin enforcer reads its model from: a `file` path or inline `text`.

```ts
export declare class CasbinEnforcerModelDrivers extends ConstClass {
    static readonly FILE = "file";
    static readonly TEXT = "text";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinRuleVariants`

*class*

Relation prefixes the Casbin MODEL declares (`p` + `g`..`g5`), which {@link AuthorizationPolicyVariants} maps onto (many app edge-types -> one rule). Keep in sync with the model's `[role_definition]`.

```ts
export declare class CasbinRuleVariants {
    /** Permission policy line. */
    static readonly P = "p";
    /** Numbered in request-tuple order (sub -> dom -> obj -> act): g (sub), g2/g3 (dom), g4 (obj), g5 (act). */
    /** Grouping #1 - role membership + role inheritance (user→role, role→role). The `sub` axis. */
    static readonly G = "g";
    /** Grouping #2 - user→domain membership (join_domain). The `dom` axis (membership). */
    static readonly G2 = "g2";
    /** Grouping #3 - domain hierarchy. The `dom` axis (nesting). */
    static readonly G3 = "g3";
    /** Grouping #4 - resource hierarchy. The `obj` axis. */
    static readonly G4 = "g4";
    /** Grouping #5 - action hierarchy. The `act` axis. */
    static readonly G5 = "g5";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `ChangePasswordRequestSchema`

*const*

Validates a change-password body: `scheme`, `oldCredential` and `newCredential` (each at least 8 characters) and the `userId`.

```ts
export declare const ChangePasswordRequestSchema: z.ZodObject<{
    scheme: z.ZodString;
    oldCredential: z.ZodString;
    newCredential: z.ZodString;
    userId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/change-password.schema.ts`

## `clientStream`

*const*

Client streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'client_streaming'.

```ts
export declare const clientStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `commonResponseHeaders`

*const*

OpenAPI response headers every CRUD route documents: the request tracing id, the record count and the response format.

```ts
export declare const commonResponseHeaders: TResponseHeaders;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `CompressEncodings`

*class*

The `encoding` of `ICompressOptions`.

```ts
export declare class CompressEncodings extends ConstClass {
    static readonly GZIP = "gzip";
    static readonly DEFLATE = "deflate";
}
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `Container`

*class*

Dependency injection container whose metadata registry is the IGNIS `MetadataRegistry`.

```ts
export declare class Container extends DIContainer {
    logger: ILogger;
    /** Resolved through `BaseHelper`, which asks `LoggerFactory` (browser-pure, the console by default). A server host gets the provider the application chose, or Winston when it chose none. */
    constructor(opts?: {
        scope: string;
    });
    getMetadataRegistry(): _MetadataRegistry;
}
```

Source: `packages/kernel/src/helpers/inversion/container.ts`

## `ContextUtility`

*class*

Casts of the Hono context that the types cannot prove.

```ts
export declare class ContextUtility {
    /** Casts middleware context to TContext (safe -- structurally identical to Context). */
    static asTypedContext<E extends Env>(opts: {
        context: unknown;
    }): TContext<E, string>;
}
```

Source: `packages/kernel/src/base/controllers/context.ts`

## `controller`

*const*

Class decorator that registers the class as a controller artifact and stores its `path`, tags and transport (REST by default, or gRPC with a `service`).

**Example**
```typescript
import { BaseRestController, controller } from '@venizia/ignis';

export @controller({ path: '/orders', tags: ['Order'] })
class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding(): void {}
}
```

```ts
export declare const controller: (metadata: TControllerMetadata) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/routes/controller.ts`

## `ControllerTransports`

*class*

Transport protocol constants for controllers.

```ts
export declare class ControllerTransports {
    static readonly REST = "rest";
    static readonly GRPC = "grpc";
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `CoreBindings`

*class*

Core binding keys for fundamental application components and configuration.

```ts
export declare class CoreBindings extends BindingKeys {
    static readonly APPLICATION_INSTANCE: import("@venizia/ignis-inversion").TBindingKey<unknown>;
    static readonly APPLICATION_SERVER: import("@venizia/ignis-inversion").TBindingKey<unknown>;
    static readonly APPLICATION_CONFIG: import("@venizia/ignis-inversion").TBindingKey<unknown>;
    static readonly APPLICATION_PROJECT_ROOT: import("@venizia/ignis-inversion").TBindingKey<string>;
    static readonly APPLICATION_ROOT_ROUTER: import("@venizia/ignis-inversion").TBindingKey<unknown>;
    static readonly APPLICATION_ENVIRONMENTS: import("@venizia/ignis-inversion").TBindingKey<unknown>;
    static readonly APPLICATION_MIDDLEWARE_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<unknown>;
}
```

Source: `packages/kernel/src/common/bindings.ts`

## `CountableHeadersSchema`

*const*

Request header schema for the `x-request-count-data` header, which switches a response between `{ count, data }` and the raw payload.

```ts
export declare const CountableHeadersSchema: z.ZodObject<{
    "x-request-count": z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/controllers/common/schemas.ts`

## `CountSchema`

*const*

The zod-backed result schema, kept apart from `results.ts` ON PURPOSE. `z.object()` runs at module
load, so any bundle reaching this file carries the whole of zod - and `results.ts` is on
`AbstractRepository`'s path, which a consumer that never serves HTTP still needs.

```ts
export declare const CountSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/repositories/common/types/result-schemas.ts`
