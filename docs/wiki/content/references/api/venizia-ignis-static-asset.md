---
title: "@venizia/ignis/static-asset"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

60 exports, 60 with TSDoc.

## `AssetCommitToken`

*class*

Signs and reads the token a route or a service trusts instead of a key a caller names. The default payload is what the
commit route binds; an application with a token of its own shape, or of its own format, configures an instance (a
codec, who the token is for, the expiry, a check of its own) and uses it from any service, with or without a route.

Reading checks, in this order: the signature, the owner, the expiry, `validate`. A token that fails the first two is
`INVALID` whatever else is wrong with it, so an expired token of someone else is not reported as expired.

```ts
export declare class AssetCommitToken<TPayload extends object = ICommitTokenPayload> {
    private readonly secretKey;
    private readonly codec;
    private readonly expiresAtOf;
    private readonly ownerOf?;
    private readonly validate?;
    private readonly errors;
    private readonly now;
    constructor(opts: TAssetCommitTokenOptions<TPayload>);
    /** Signs a payload. */
    sign(opts: {
        payload: TPayload;
    }): string;
    /**
     * Reads a token back, or throws.
     *
     * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a name
     * prober: a forged token fails without a round trip, so timing says nothing about what exists.
     */
    verify(opts: {
        token: string;
        ownerId?: string;
    }): TPayload;
    /** `verify` for a list; the first token that fails throws, and nothing is returned. */
    verifyMany(opts: {
        tokens: readonly string[];
        ownerId?: string;
    }): TPayload[];
    /** Signs `{ bucket, key, expiresAt }` so the commit route can trust the key it is handed. */
    static build(opts: {
        payload: ICommitTokenPayload;
        secretKey: string;
    }): string;
    /** Reads a commit token back, or throws. `now` is the clock, a test seam. */
    static read(opts: {
        token: string;
        secretKey: string;
        now?: number;
    }): ICommitTokenPayload;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `AssetControllerFactory`

*class*

Builds the REST controller class for a static asset entry. Static helpers also expose label checking, object link building and served content type resolution.

```ts
export declare class AssetControllerFactory extends BaseHelper {
    constructor();
    /** Names any label a caller put in the query - where the upload routes refuse it. */
    static findLabelsInQuery(opts: {
        query: Record<string, string>;
        names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
    }): string[];
    /** The URL of one object, in the shape its controller serves: no `/buckets/<name>` with a configured bucket, and a raw path with `rawObjectPath`. */
    static buildObjectLink(opts: IObjectLocation & {
        basePath: string;
        hasConfiguredBucket?: boolean;
        rawObjectPath?: boolean;
    }): string;
    /**
     * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
     * the API origin is stored XSS. Public so a hand-written route makes the same decision - the
     * backend's own content-type is dropped by `WHITELIST_HEADERS`.
     */
    static resolveServedContentType(opts: {
        helper: IStorageHelper;
        object: IObjectRef;
    }): {
        contentType: string;
        isRenderable: boolean;
    };
    static defineAssetController(opts: IAssetControllerOptions): {
        new (): {
            /** Clears the multipart spool files written by `parseMultipartBody({ storage: 'disk' })`. */
            removeSpoolFiles(spoolOptions: {
                paths: string[];
            }): void;
            binding(): ValueOrPromise<void>;
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<any>;
            normalizeCountData<ResponseSchema extends unknown, RequestContext extends TRouteContext<Env> = TRouteContext<Env>, ResponseData extends {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            } = {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            }>(opts: {
                context: RequestContext;
                payload: ResponseData;
            }): ResponseData | import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            getRequestedExtras(opts: {
                context: TRouteContext<Env>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: TRouteContext<Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: never;
            }): R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | null | undefined;
            respond<R, Extra extends Record<string, import("@venizia/ignis-kernel").TResponseExtra>>(opts: {
                context: TRouteContext<Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra: Extra;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | {
                count?: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Partial<Record<keyof Extra, unknown>>;
            } | null | undefined>;
            respond<R>(opts: {
                context: TRouteContext<Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): ValueOrPromise<R | {
                count?: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
                extra?: Record<string, unknown>;
            } | null | undefined>;
            respondWithExtra<R>(opts: {
                context: TRouteContext<Env>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                extra: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | {
                count: number;
                data: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Record<string, unknown>;
            } | {
                data: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Record<string, unknown>;
                count?: undefined;
            } | null | undefined>;
            setListHeaders(opts: {
                context: TRouteContext<Env>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<ResponseType = unknown>(opts: {
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, Env>;
            }): import("hono").Handler<Env, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, Env, {}, "/">;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, Env>;
                hook?: import("@hono/zod-openapi").Hook<any, Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, Env, {}, "/">;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, Env>;
                hook?: import("@hono/zod-openapi").Hook<any, Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, Env, {}, "/">;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<Env, {}, "/">;
            path: string;
            definitions: Record<string, import("@venizia/ignis-kernel").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<Env, {}, "/">;
            registerRoutesFromRegistry(opts?: {
                paths?: import("@venizia/ignis-kernel").TRoutePathScope;
            }): void;
            configure(opts?: {} | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<Env, {}, "/">>;
            buildRouteMiddlewares<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<Env>[];
            };
            getRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
            };
            getJSXRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
            };
            bindDefaultRoutes(): ValueOrPromise<void>;
            scope: string;
            identifier: string;
            get logger(): import("@venizia/ignis-helpers").ILogger;
            set logger(value: import("@venizia/ignis-helpers").ILogger);
            getIdentifier(): string;
            getLogger(): import("@venizia/ignis-helpers").ILogger;
        };
    };
}

/** One list: the reader below and the stale-caller warning must agree. */
declare const UPLOAD_LABEL_NAMES: readonly ["principalType", "principalId", "variant", "sequence", "folderPath"];
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `AssetIngest`

*class*

Storing an object that came from somewhere else.

```ts
export declare class AssetIngest {
    /**
     * Fetches an untrusted url and stores what comes back, without the bytes passing through this
     * process: the guarded body is capped and handed to `writeStream` as a stream.
     *
     * The url is guarded by `UrlIngest.fetchGuarded` - scheme allow-list, every resolved address
     * checked, redirects walked by hand with a per-hop re-check, and a timeout. The connection goes to the
     * address that was checked, so a DNS answer that changes afterwards is never used; see `UrlIngest.fetchGuarded`.
     *
     * The served content type is decided from the stored KEY, never from what the remote host
     * claimed - the same rule the asset routes apply, and for the same reason.
     */
    static fromUrl(opts: IIngestFromUrlOptions): Promise<IIngestFromUrlResult>;
}
```

Source: `packages/core-server/src/components/static-asset/ingest.ts`

## `AssetPresignProxy`

*class*

Forwards presigned storage requests under the limits of `IAssetProxyOptions`.

```ts
export declare class AssetPresignProxy {
    /** The route path with exactly one leading slash and none at the end. */
    static normalizePath(opts: {
        path?: string;
    }): string;
    /** Throws when the options cannot be served safely, at registration rather than on the first request. */
    static assertOptions(opts: {
        name: string;
        proxy: IAssetProxyOptions;
        bucket?: TValueOrAsyncResolver<string>;
    }): void;
    /** Registers the proxy routes on a generated controller. Called after every built-in route, so a built-in wins a path collision. */
    static register(opts: {
        controller: BaseRestController;
        proxy: IAssetProxyOptions;
        bucket?: TValueOrAsyncResolver<string>;
    }): void;
    /** The storage path of the request: what follows the mount path of the URL, dot segments already resolved by the URL parser. */
    private static resolveStoragePath;
    private static buildCorsHeaders;
    /** The prefixes a request may reach: the ones declared, else the bucket of the controller, read now. */
    private static resolvePrefixes;
    /** Forwards one request, or answers the preflight. A failure the proxy itself names is first offered to `proxy.errorResponse`. */
    static forward(opts: {
        request: Request;
        mountPath: string;
        proxy: IAssetProxyOptions;
        bucket?: TValueOrAsyncResolver<string>;
    }): Promise<Response>;
    /** Which of the proxy's own failures this error is; any other error (a bug, an abort of the request) is not the proxy's to answer. */
    private static readFailure;
    private static forwardUnchecked;
}
```

Source: `packages/core-server/src/components/static-asset/proxy/proxy.ts`

## `AssetPresignService`

*class*

Prepares uploads straight to storage: it checks what the client announced, decides the key, signs a PUT URL whose
size, content type and tags the client cannot change, and signs a token that names the object.

A presigned PUT has a limit a POST policy does not: the storage enforces the signed `content-length`, but nothing
bounds the size range, so what is announced is what is allowed. Verify the size again where the token is read.

```ts
export declare class AssetPresignService<TPayload extends object, TContext> {
    private readonly options;
    private readonly errors;
    private readonly allowed;
    constructor(opts: IAssetPresignServiceOptions<TPayload, TContext>);
    /** Builds the service of one application. */
    static build<TPayload extends object, TContext>(opts: IAssetPresignServiceOptions<TPayload, TContext>): AssetPresignService<TPayload, TContext>;
    /** One URL and one token for each file. Nothing is signed unless every file passes. */
    presign(opts: IAssetPresignRequest<TContext>): Promise<IAssetPresignResult[]>;
    private checkFile;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `AssetProxyErrors`

*const*

Codes of the presigned-URL proxy. A separate catalog from `StaticAssetErrors`, which holds only caller-facing 4xx codes: a dead storage is a 5xx.

```ts
export declare const AssetProxyErrors: {
    /** The proxy was asked for a storage path outside `allowedPathPrefixes`; nothing is forwarded. */
    readonly PATH_REFUSED: {
        readonly message: {
            readonly text: "Storage path is not served by this proxy";
            readonly code: "core.static_asset.proxy_path_refused";
        };
        readonly statusCode: 404;
        readonly category: "validation";
    };
    /** The storage did not answer. The cause goes to the log, never to the response. */
    readonly UPSTREAM_FAILED: {
        readonly message: {
            readonly text: "Storage is unreachable";
            readonly code: "core.static_asset.proxy_upstream_failed";
        };
        readonly statusCode: 502;
        readonly category: "integration";
    };
};
```

Source: `packages/core-server/src/components/static-asset/proxy/errors.ts`

## `AssetProxyFailures`

*class*

The failures of the presigned-URL proxy itself that `proxy.errorResponse` is offered.

```ts
export declare class AssetProxyFailures {
    static readonly PATH_REFUSED = "PATH_REFUSED";
    static readonly UPSTREAM_FAILED = "UPSTREAM_FAILED";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `AssetServiceBindingKeys`

*class*

Container keys of the services `AssetServicesComponent` binds.

```ts
export declare class AssetServiceBindingKeys {
    /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. */
    static readonly ASSET_SERVICES_COMPONENT_OPTIONS = "@app/static-asset-services/options";
    /** The key of the token service registered under `name`. */
    static token(opts: {
        name: string;
    }): string;
    /** The key of the presign service registered under `name`. */
    static presign(opts: {
        name: string;
    }): string;
    /** The key of the settle service registered under `name`. */
    static settle(opts: {
        name: string;
    }): string;
}
```

Source: `packages/core-server/src/components/static-asset/service/component.ts`

## `AssetServicesComponent`

*class*

Binds `AssetTokenService`, `AssetPresignService` and `AssetSettleService` into the container, WITHOUT any route, so a
service that only needs to verify a file token or settle an upload can inject them:

`@inject({ key: AssetServiceBindingKeys.token({ name: 'attachments' }) })`

The services are built where their options live; this component only gives them a place in the container.

```ts
export declare class AssetServicesComponent extends BaseComponent<TAssetServicesComponentOptions> {
    private application;
    constructor(application: BaseApplication);
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/static-asset/service/component.ts`

## `AssetSettleService`

*class*

Settles uploads written straight to their final key with a pending tag: the object is kept by replacing its tags, and
an object never settled is left for the storage's lifecycle rule. Nothing is copied or moved.

For uploads that wait under a pending prefix and are copied into place, use the `directUpload` routes of the
component instead.

```ts
export declare class AssetSettleService {
    private readonly options;
    constructor(opts: IAssetSettleServiceOptions);
    /** Builds the service of one application. */
    static build(opts: IAssetSettleServiceOptions): AssetSettleService;
    /**
     * Replaces the tags of every key, all of them attempted. The first failure is thrown once every key has been tried,
     * so one bad object does not leave the others unsettled.
     *
     * `tags` are merged over the configured ones, for a call that knows more (a file that passed a later check).
     */
    settle(opts: {
        keys: readonly string[];
        tags?: Record<string, string>;
    }): Promise<void>;
}
```

Source: `packages/core-server/src/components/static-asset/service/settle.ts`

## `AssetTokenCodecs`

*class*

The codec IGNIS ships: `base64url(JSON payload) + '.' + base64url(HMAC-SHA256 of that text)`.

```ts
export declare class AssetTokenCodecs {
    /**
     * Builds the default codec. `isPayload` is the application's check that a signed JSON object has the shape it expects:
     * the body is only read after its signature passed, but a payload of another shape must never reach the caller.
     */
    static signedJson<TPayload extends object>(opts: {
        isPayload: (value: unknown) => value is TPayload;
    }): IAssetTokenCodec<TPayload>;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `BaseMetaLinkModel`

*class*

One row per (object, owner) pairing, NOT per object: one product image attached to the product and to each variant is the common case, so `(bucketName, objectName)` is indexed and deliberately NOT unique.

```ts
export declare class BaseMetaLinkModel extends BaseRelationalEntity<typeof BaseMetaLinkModel.schema> {
    static schema: import("drizzle-orm/pg-core").PgTableWithColumns<{
        name: "MetaLink";
        schema: undefined;
        columns: {
            bucketName: import("drizzle-orm/pg-core").PgColumn<{
                name: "bucket_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            objectName: import("drizzle-orm/pg-core").PgColumn<{
                name: "object_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            link: import("drizzle-orm/pg-core").PgColumn<{
                name: "link";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            mimetype: import("drizzle-orm/pg-core").PgColumn<{
                name: "mimetype";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            size: import("drizzle-orm/pg-core").PgColumn<{
                name: "size";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            etag: import("drizzle-orm/pg-core").PgColumn<{
                name: "etag";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            metadata: import("drizzle-orm/pg-core").PgColumn<{
                name: "metadata";
                tableName: "MetaLink";
                dataType: "json";
                columnType: "PgJsonb";
                data: Record<string, any>;
                driverParam: unknown;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                $type: Record<string, any>;
            }>;
            storageType: import("drizzle-orm/pg-core").PgColumn<{
                name: "storage_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            isSynced: import("drizzle-orm/pg-core").PgColumn<{
                name: "is_synced";
                tableName: "MetaLink";
                dataType: "boolean";
                columnType: "PgBoolean";
                data: boolean;
                driverParam: boolean;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            variant: import("drizzle-orm/pg-core").PgColumn<{
                name: "variant";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            sequence: import("drizzle-orm/pg-core").PgColumn<{
                name: "sequence";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalType: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalId: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            createdAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            modifiedAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            id: import("drizzle-orm/pg-core").PgColumn<{
                name: "id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: true;
                isAutoincrement: false;
                hasRuntimeDefault: true;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
        } | {
            bucketName: import("drizzle-orm/pg-core").PgColumn<{
                name: "bucket_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            objectName: import("drizzle-orm/pg-core").PgColumn<{
                name: "object_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            link: import("drizzle-orm/pg-core").PgColumn<{
                name: "link";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            mimetype: import("drizzle-orm/pg-core").PgColumn<{
                name: "mimetype";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            size: import("drizzle-orm/pg-core").PgColumn<{
                name: "size";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            etag: import("drizzle-orm/pg-core").PgColumn<{
                name: "etag";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            metadata: import("drizzle-orm/pg-core").PgColumn<{
                name: "metadata";
                tableName: "MetaLink";
                dataType: "json";
                columnType: "PgJsonb";
                data: Record<string, any>;
                driverParam: unknown;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                $type: Record<string, any>;
            }>;
            storageType: import("drizzle-orm/pg-core").PgColumn<{
                name: "storage_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            isSynced: import("drizzle-orm/pg-core").PgColumn<{
                name: "is_synced";
                tableName: "MetaLink";
                dataType: "boolean";
                columnType: "PgBoolean";
                data: boolean;
                driverParam: boolean;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            variant: import("drizzle-orm/pg-core").PgColumn<{
                name: "variant";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            sequence: import("drizzle-orm/pg-core").PgColumn<{
                name: "sequence";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalType: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalId: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            createdAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            modifiedAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            id: import("drizzle-orm/pg-core").PgColumn<{
                name: "id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: true;
                isAutoincrement: false;
                hasRuntimeDefault: true;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
        };
        dialect: "pg";
    }>;
    static relations: () => never[];
}
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `BaseMetaLinkRepository`

*class*

Base MetaLink repository - bind a model + datasource via @repository in a subclass.

```ts
export declare class BaseMetaLinkRepository extends DefaultCRUDRepository<typeof BaseMetaLinkModel.schema> {
}
```

Source: `packages/core-server/src/components/static-asset/repositories/base.repository.ts`

## `DEFAULT_MAX_UPLOAD_FILES`

*const*

The most file parts one upload request may carry unless `parseMultipartBody.maxFiles` says otherwise.

```ts
export declare const DEFAULT_MAX_UPLOAD_FILES = 20;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `IAssetControllerOptions`

*interface*

Input of `AssetControllerFactory.defineAssetController`: one entry of `TStaticAssetsComponentOptions` with its storage type and helper.

```ts
export interface IAssetControllerOptions {
    controller: TStaticAssetsComponentOptions[string]['controller'];
    storage: TStaticAssetStorageType;
    helper: IStorageHelper;
    useMetaLink?: boolean;
    /** The table is erased at this seam on purpose. The public option types carry the real `Schema` and check it; inside the controller every read and write is on MetaLink COLUMNS, and threading a table type nobody here constrains through 700 lines of handler buys nothing. */
    metaLink?: TMetaLinkConfig<AnyType>;
    options?: TStaticAssetExtraOptions;
    /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
    resolveObjectName?: TObjectNameResolver;
    /** Registers the application's own routes on the generated controller, after every built-in one. */
    /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
    defineRoutesBefore?: TDefineExtraRoutes;
    defineExtraRoutes?: TDefineExtraRoutes;
}
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `IAssetPresignErrors`

*interface*

The definitions `AssetPresignService` throws; the `errors` option takes any subset. `messageArgs` carry `extension`, `maxBytes`, `maxMegabytes` and `max`.

```ts
export interface IAssetPresignErrors {
    /** @default StaticAssetErrors.PRESIGN_EXTENSION_NOT_ALLOWED */
    EXTENSION_NOT_ALLOWED: TErrorDefinition;
    /** @default StaticAssetErrors.PRESIGN_FILE_SIZE_INVALID */
    FILE_SIZE_INVALID: TErrorDefinition;
    /** @default StaticAssetErrors.UPLOAD_TOO_LARGE */
    FILE_TOO_LARGE: TErrorDefinition;
    /** @default RequestBodyErrors.TOO_MANY_FILES */
    TOO_MANY_FILES: TErrorDefinition;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetPresignFile`

*interface*

One file a client announces it is about to upload. The server never trusts the name for the key, and the size is signed.

```ts
export interface IAssetPresignFile {
    fileName: string;
    contentType: string;
    /** Bytes. Signed into the URL, so the upload must be exactly this long. */
    size: number;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetPresignPayloadInput`

*interface*

What `buildPayload` is told about the file it signs a token for.

```ts
export interface IAssetPresignPayloadInput<TContext> {
    /** The full object key. */
    key: string;
    /** The last segment of `key`: the name the server chose. */
    name: string;
    /** The folder `resolvePath` answered, `''` for the root. */
    folder: string;
    /** The extension of the announced name, with its dot, in lower case. */
    extension: string;
    file: IAssetPresignFile;
    /** Epoch milliseconds the URL was issued at. */
    issuedAt: number;
    ownerId?: string;
    context: TContext;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetPresignRequest`

*interface*

What a presign call takes: the files, what the application knows about the caller, and the user the token is issued for.

```ts
export interface IAssetPresignRequest<TContext> {
    files: readonly IAssetPresignFile[];
    /** Reaches `resolvePath` and `buildPayload`. */
    context: TContext;
    /** The user a token is issued for; absent for a service call, and a token with no owner cannot be claimed by anyone. */
    ownerId?: string;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetPresignResult`

*interface*

What one prepared file gives its client.

```ts
export interface IAssetPresignResult {
    /** Where the client PUTs the bytes. */
    preSignUrl: string;
    /** What the client hands back to name the file. */
    fileKeyToken: string;
    /** The object key, for the server's own use. */
    key: string;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetPresignServiceOptions`

*interface*

Everything an application decides about presigned uploads.

```ts
export interface IAssetPresignServiceOptions<TPayload extends object, TContext> {
    /** The storage. It has to support `presignPut` (`BunS3Helper` does). */
    helper: IStorageHelper;
    /** The bucket the objects go to, read per call. */
    bucket: TValueOrAsyncResolver<string>;
    /** Signs the token each URL comes with. */
    token: AssetCommitToken<TPayload>;
    /** The extensions that may be uploaded, with their dot and in lower case. */
    allowedExtensions: readonly string[];
    /** The largest file, in bytes. */
    maxBytes: number;
    /**
     * The most files one call prepares.
     *
     * @default 10
     */
    maxFiles?: number;
    /**
     * The deepest folder nesting a key may have, as `isValidObjectKey` counts it. A tenant path is often deeper than the
     * helper's own default.
     *
     * @default the storage helper's own default
     */
    maxFolderDepth?: number;
    /**
     * The folder an object goes under, decided from the context the application passes to `presign`: a tenant, a purpose,
     * the extension. `''` is the root. Never taken from the client by this service.
     *
     * @default () => ''
     */
    resolvePath?: (opts: {
        file: IAssetPresignFile;
        extension: string;
        context: TContext;
    }) => ValueOrPromise<string>;
    /**
     * The stored name, with its extension. Answer a name the client cannot predict, or two uploads can collide.
     *
     * @default a v4 uuid plus the extension
     */
    resolveName?: (opts: {
        file: IAssetPresignFile;
        extension: string;
    }) => string;
    /** The payload of the token of one file: what the application needs to find the object again. */
    buildPayload: (opts: IAssetPresignPayloadInput<TContext>) => TPayload;
    /** Tags written with the object. They are signed, so the client must send them back unchanged. */
    tagging?: Record<string, string>;
    /**
     * A content type that is signed instead of the one the client announced, so the holder of the URL cannot choose the
     * stored type. Absent, the announced one is signed.
     */
    signedContentType?: string;
    /** How long the URL is good. Absent, the storage helper's own default. */
    expiresIn?: IDuration;
    /** Rewrites the URL after it is signed, e.g. to send the browser through the asset proxy. */
    rewriteUrl?: (opts: {
        url: string;
    }) => string;
    /** Definitions thrown in place of the defaults, by name. */
    errors?: Partial<IAssetPresignErrors>;
    /** The clock, in epoch milliseconds. A test seam. */
    now?: () => number;
}
```

Source: `packages/core-server/src/components/static-asset/service/presign.ts`

## `IAssetProxyCors`

*interface*

The CORS answer the proxy gives. Left out, the proxy sets no CORS header at all, so an application-wide CORS middleware stays in charge.

```ts
export interface IAssetProxyCors {
    /** The `access-control-allow-origin` value, e.g. `*` or one origin. */
    allowOrigin: string;
    /** @default ['content-type', 'x-amz-tagging'] */
    allowHeaders?: readonly string[];
    /** @default ['ETag', 'Content-Length', 'Content-Type', 'Content-Disposition'] */
    exposeHeaders?: readonly string[];
}
```

Source: `packages/core-server/src/components/static-asset/proxy/proxy.ts`

## `IAssetProxyOptions`

*interface*

A storage proxy in front of presigned URLs: a browser that cannot reach the storage endpoint (it is internal) sends
the presigned request to the application, which forwards it unchanged.

The route carries NO authentication. The storage signature in the URL is the authentication, and the proxy forwards
the request untouched, so a request the storage would refuse is refused there. What the proxy adds is only a limit
on WHERE it forwards (`allowedPathPrefixes`) and on which headers it passes on.

```ts
export interface IAssetProxyOptions {
    /** The flag. `false` (or an absent `proxy`) registers no proxy route. */
    enable: boolean;
    /** The storage endpoint requests are forwarded to, e.g. the internal host of the S3 service. Read per request. */
    upstreamEndpoint: TValueOrAsyncResolver<string>;
    /**
     * The route path under the controller's base path: requests to `{basePath}{path}/<storage path>` are forwarded.
     *
     * @default '/proxy'
     */
    path?: string;
    /**
     * The storage paths a request may reach, after dot segments are resolved: a path that does not start with one of these
     * is a 404 and is never forwarded. Absent, it is `/{bucket}/` of `controller.bucket`; with neither, registering the
     * controller throws, because a proxy open to the whole storage endpoint is not something to default to.
     */
    allowedPathPrefixes?: readonly string[];
    /**
     * The request headers passed on. Everything else is dropped, so a caller cannot add a header that was not signed.
     *
     * @default ['content-type', 'content-length', 'x-amz-tagging']
     */
    forwardRequestHeaders?: readonly string[];
    cors?: IAssetProxyCors;
    /**
     * Gives up on the storage after this long.
     *
     * @default 600_000
     */
    timeoutMs?: number;
    /**
     * Answers a failure of the proxy itself instead of the JSON error body: `PATH_REFUSED` (a storage path outside the allowed
     * prefixes) or `UPSTREAM_FAILED` (the storage did not answer). The caller of a proxy is a browser PUTting bytes, not an
     * application that branches on codes, so an application MAY answer a plain 404 / 502 here. Return `undefined` to keep the
     * default error answer. Its response carries no CORS header of its own: add what the browser needs.
     */
    errorResponse?: (opts: {
        reason: TAssetProxyFailure;
        request: Request;
    }) => Response | undefined;
}
```

Source: `packages/core-server/src/components/static-asset/proxy/proxy.ts`

## `IAssetServicesEntry`

*interface*

The services of one name: each is built by the application with its own `build` and bound as it is.

```ts
export interface IAssetServicesEntry {
    token?: AssetCommitToken<AnyType>;
    presign?: AssetPresignService<AnyType, AnyType>;
    settle?: AssetSettleService;
}
```

Source: `packages/core-server/src/components/static-asset/service/component.ts`

## `IAssetSettleServiceOptions`

*interface*

What an application decides about settling uploads.

```ts
export interface IAssetSettleServiceOptions {
    /** The storage. It has to support `replaceObjectTags` (`BunS3Helper` does). */
    helper: IStorageHelper;
    /** The bucket the objects are in, read per call. */
    bucket: TValueOrAsyncResolver<string>;
    /**
     * The tags a settled object carries from then on, replacing the ones the upload was written with. A lifecycle rule
     * that removes objects still tagged as pending is what keeps abandoned uploads from piling up.
     */
    tags: Record<string, string>;
}
```

Source: `packages/core-server/src/components/static-asset/service/settle.ts`

## `IAssetTokenCodec`

*interface*

How a token is written and read: the piece an application replaces when it must produce, or keep accepting, a token
format of its own. `decode` answers `null` for anything it cannot trust (malformed, wrong signature) and never throws
for bad input. A codec MUST compare signatures in constant time (`Hash.equals`).

```ts
export interface IAssetTokenCodec<TPayload extends object> {
    encode: (opts: {
        payload: TPayload;
        secretKey: string;
    }) => string;
    decode: (opts: {
        token: string;
        secretKey: string;
    }) => TPayload | null;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `IAssetTokenErrors`

*interface*

The definitions the token reader throws; the `errors` option takes any subset.

```ts
export interface IAssetTokenErrors {
    /** Malformed, wrong signature, not the caller's, or refused by `validate`: all one answer, so the reader is no oracle. */
    INVALID: TErrorDefinition;
    /** Only for a token whose signature and owner are good. */
    EXPIRED: TErrorDefinition;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `ICommitTokenPayload`

*interface*

What a commit token binds. Business fields are deliberately absent - which order or tenant an upload belongs to is the application's, and a token the framework signs is the wrong place to put its authorization.

```ts
export interface ICommitTokenPayload {
    bucket: string;
    key: string;
    expiresAt: number;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `IIngestFromUrlOptions`

*interface*

Where a fetched object lands, and what it is attached to.

```ts
export interface IIngestFromUrlOptions {
    helper: IStorageHelper;
    url: string;
    bucket: IBucketRef;
    /**
     * Decides the stored key.
     *
     * **Absent, the key comes from the remote url's last path segment - which on an untrusted url is
     * named by whoever supplied it.** Pass `resolveKey` whenever the url is not your own; the
     * validation below bounds what it can do, but it does not make the remote name yours.
     */
    resolveKey?: (opts: {
        url: URL;
        contentType: string;
    }) => string;
    folderPath?: string;
    /** Absent leaves IGNIS's own default: https only, no private address, 3 hops, 10s, 10 MB. */
    policy?: IUrlSafetyPolicy;
    /**
     * Folder nesting the key may carry.
     *
     * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
     */
    maxFolderDepth?: number;
    /**
     * Where the object is served from. **Required**: an absent hook used to yield an empty link, which
     * is exactly the value that satisfies a NOT NULL column and points nowhere.
     */
    normalizeLinkFn: (opts: {
        bucket: IBucketRef;
        object: IObjectRef;
    }) => string;
}
```

Source: `packages/core-server/src/components/static-asset/ingest.ts`

## `IIngestFromUrlResult`

*interface*

What was stored, and what the backend reports about it. The stat is returned because `getStat`
already ran to size the result - a caller writing its own row would otherwise pay for it twice.

This does NOT write a meta link. The columns an application attaches to an object - a principal,
a variant - come from its own domain, not from the object, so the row stays the caller's.

```ts
export interface IIngestFromUrlResult {
    upload: IUploadResult;
    stat: IFileStat;
}
```

Source: `packages/core-server/src/components/static-asset/ingest.ts`

## `META_LINK_CREATE_FAILED`

*const*

Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`.

```ts
export declare const META_LINK_CREATE_FAILED = "META_LINK_CREATE_FAILED";
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `MetaLinkRecreateActions`

*class*

What `recreate-metalink` did: refreshed the rows of an object, or created its first one.

```ts
export declare class MetaLinkRecreateActions {
    static readonly CREATED = "created";
    static readonly REFRESHED = "refreshed";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `RENDERABLE_CONTENT_TYPES`

*const*

Types the controller will let a browser render, keyed off the object name. Anything absent here is
served as an attachment, because a renderable upload on the API origin is stored XSS - and `nosniff`
cannot stop a type we declared ourselves. `image/svg+xml` is deliberately excluded: SVG carries script.

```ts
export declare const RENDERABLE_CONTENT_TYPES: Set<string>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetComponent`

*class*

`Schema` is the MetaLink table the application binds. It has to live on the CLASS, not only on the options: `component(Ctor, { options })` infers the options from the class, so a class pinned to the shipped table can only carry options for that table.

```ts
export declare class StaticAssetComponent<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> extends BaseComponent<TStaticAssetsComponentOptions<Schema>> {
    private application;
    constructor(application: BaseApplication);
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/static-asset/component.ts`

## `StaticAssetComponentBindingKeys`

*class*

Container keys of the static asset component.

```ts
export declare class StaticAssetComponentBindingKeys {
    /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
    static readonly STATIC_ASSET_COMPONENT_OPTIONS = "@app/static-asset-component/options";
}
```

Source: `packages/core-server/src/components/static-asset/common/keys.ts`

## `StaticAssetErrors`

*const*

Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value.

```ts
export declare const StaticAssetErrors: {
    readonly UPLOAD_NOT_AUTHORIZED: {
        readonly message: {
            readonly text: "Not allowed to request a signed upload";
            readonly code: "core.static_asset.upload_not_authorized";
        };
        readonly statusCode: 403;
        readonly category: "validation";
    };
    /** Both upload paths - one condition, one code to branch on. */
    readonly UPLOAD_TOO_LARGE: {
        readonly message: {
            readonly text: "File is larger than the maximum allowed";
            readonly code: "core.static_asset.upload_too_large";
        };
        readonly statusCode: 413;
        readonly category: "validation";
    };
    /** Deliberately not 404 and deliberately not "expired": a caller learns only that the token is no good, never whether the key it names exists. */
    readonly INVALID_COMMIT_TOKEN: {
        readonly message: {
            readonly text: "Invalid commit token";
            readonly code: "core.static_asset.invalid_commit_token";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly EXPIRED_COMMIT_TOKEN: {
        readonly message: {
            readonly text: "Commit token has expired";
            readonly code: "core.static_asset.expired_commit_token";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** Labels ride the body; one in the URL would otherwise leave the row unlabelled without a word. */
    readonly LABELS_IN_QUERY: {
        readonly message: {
            readonly text: "Upload labels belong in the request body, not the query";
            readonly code: "core.static_asset.labels_in_query";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly BUCKET_NAME_INVALID: {
        readonly message: {
            readonly text: "Invalid bucket name";
            readonly code: "core.static_asset.bucket_name_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly OBJECT_NAME_INVALID: {
        readonly message: {
            readonly text: "Invalid object name or path";
            readonly code: "core.static_asset.object_name_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** The application's naming hook produced a key outside `controller.keyPrefix`; nothing is written. */
    readonly OBJECT_KEY_OUT_OF_SCOPE: {
        readonly message: {
            readonly text: "Object key is outside the key prefix of this controller";
            readonly code: "core.static_asset.object_key_out_of_scope";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FOLDER_PATH_INVALID: {
        readonly message: {
            readonly text: "Invalid folder path";
            readonly code: "core.static_asset.folder_path_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FOLDER_SEGMENT_INVALID: {
        readonly message: {
            readonly text: "Invalid folder path segment";
            readonly code: "core.static_asset.folder_segment_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FOLDER_DEPTH_EXCEEDED: {
        readonly message: {
            readonly text: "Folder path exceeds the maximum depth";
            readonly code: "core.static_asset.folder_depth_exceeded";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FILE_EMPTY: {
        readonly message: {
            readonly text: "Empty file content";
            readonly code: "core.static_asset.file_empty";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly MAX_KEYS_INVALID: {
        readonly message: {
            readonly text: "Invalid maxKeys - expected a positive integer";
            readonly code: "core.static_asset.max_keys_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** A presigned upload was announced under an extension the application does not accept. */
    readonly PRESIGN_EXTENSION_NOT_ALLOWED: {
        readonly message: {
            readonly text: "Files ending in \"%{extension}\" cannot be uploaded";
            readonly code: "core.static_asset.presign_extension_not_allowed";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** A presigned upload was announced with a size that is not a positive whole number of bytes. */
    readonly PRESIGN_FILE_SIZE_INVALID: {
        readonly message: {
            readonly text: "The file size must be a positive whole number of bytes";
            readonly code: "core.static_asset.presign_file_size_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/core-server/src/components/static-asset/common/errors.ts`

## `StaticAssetStorageTypes`

*class*

Storage backends a static asset controller can serve from. `isValid` checks a string against them.

```ts
export declare class StaticAssetStorageTypes {
    static readonly DISK = "disk";
    static readonly BUN_S3 = "bun-s3";
    static readonly SCHEME_SET: Set<string>;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `TAssetCommitTokenOptions`

*type*

The options of a token reader. With the default payload (`ICommitTokenPayload`) the format and the expiry are the
default ones; any other payload names its own `codec` and `expiresAtOf`, so a token is never read with a shape it was
not written in.

```ts
export type TAssetCommitTokenOptions<TPayload extends object> = [ICommitTokenPayload] extends [
    TPayload
] ? IAssetCommitTokenBaseOptions<TPayload> & {
    /** The format. @default AssetTokenCodecs.signedJson for `ICommitTokenPayload` */
    codec?: IAssetTokenCodec<TPayload>;
    /** When a token stops being good, as epoch milliseconds; `undefined` or a non-number makes it invalid. @default payload.expiresAt */
    expiresAtOf?: (opts: {
        payload: TPayload;
    }) => number | undefined;
} : IAssetCommitTokenBaseOptions<TPayload> & {
    codec: IAssetTokenCodec<TPayload>;
    expiresAtOf: (opts: {
        payload: TPayload;
    }) => number | undefined;
};

interface IAssetCommitTokenBaseOptions<TPayload extends object> {
    /** Signs every token. Keep it out of the repository and out of the client. An empty one is refused. */
    secretKey: string;
    /**
     * Who a token was issued for. Present, `verify` demands the caller's id and refuses a token whose owner is another or
     * absent. Absent, a token is not bound to anyone and `verify` refuses an `ownerId` it cannot compare.
     */
    ownerOf?: (opts: {
        payload: TPayload;
    }) => string | undefined;
    /** A check on the payload of a token that is genuine, owned and alive (extension, size...). Throw the application's own error to refuse. */
    validate?: (opts: {
        payload: TPayload;
    }) => void;
    /** Definitions thrown in place of the defaults (`INVALID_COMMIT_TOKEN`, `EXPIRED_COMMIT_TOKEN`). */
    errors?: Partial<IAssetTokenErrors>;
    /** The clock, in epoch milliseconds. A test seam. */
    now?: () => number;
}
```

Source: `packages/core-server/src/components/static-asset/common/commit-token.ts`

## `TAssetPresigner`

*type*

What the presign route needs of a presign service: the one method it calls.

```ts
export type TAssetPresigner<TPayload extends object, TContext> = Pick<AssetPresignService<TPayload, TContext>, 'presign'>;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TAssetProxyFailure`

*type*

One of the `AssetProxyFailures` values.

```ts
export type TAssetProxyFailure = TConstValue<typeof AssetProxyFailures>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `TAssetServicesComponentOptions`

*type*

Asset services keyed by an application-chosen name.

```ts
export type TAssetServicesComponentOptions = {
    [name: string]: IAssetServicesEntry;
};
```

Source: `packages/core-server/src/components/static-asset/service/component.ts`

## `TBucketParams`

*type*

Path parameters of the bucket routes.

```ts
export type TBucketParams = {
    bucketName: string;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TDefineExtraRoutes`

*type*

Adds routes of the application's own. Registration order decides a path collision, so the same shape serves both the before and the after hook.

```ts
export type TDefineExtraRoutes = (opts: {
    controller: BaseRestController;
    helper: IStorageHelper;
    basePath: string;
}) => void;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TDirectUploadOptions`

*type*

Enables the presigned-PUT upload flow: the client asks this route for one signed URL per file, then PUTs the bytes straight to the
storage. The object is written to its FINAL key with a pending tag, and the application keeps it by settling it
(`AssetSettleService`) once the record that owns it is saved; an object never settled is left to the storage's lifecycle rule.

The route is a thin layer over `AssetPresignService`: authorize, map the request into files and a context, presign, map the answer.
Everything else (extensions, size, count, key, token, signed headers, URL rewrite, errors) is configured on the presign service.

`TCaller` is what `authorize` answers: the caller, as the application knows it (principal, roles, tenants). `TContext` is what the
presign service is given (the folder's tenant, what the upload is for); it is the caller itself unless `request.toInput` builds another.
`TBody` is the request body.

```ts
export type TDirectUploadOptions<TCaller extends object = object, TPayload extends object = ICommitTokenPayload, TBody = TPresignRequestBody, TContext = TCaller> = {
    /**
     * Who may ask for a signed URL, and as whom. REQUIRED, not defaulted: this route hands out a write credential, and there is no safe
     * default for that. Answer the caller context (an object, `{}` when there is nothing to say) to allow, or a falsy value to refuse
     * with a 403; the storage is not touched on a refusal. The answer reaches `request.toInput` and `response.map`, and without a
     * `request` it is the context the presign service gets.
     */
    authorize: (opts: {
        context: TRouteContext;
    }) => ValueOrPromise<TCaller | false | null | undefined>;
    /**
     * Prepares the uploads: an `AssetPresignService` built with the token, the extensions, the size ceiling and the key rule of the
     * application, or any object with its `presign` method (to answer the service's refusals in the application's own codes).
     */
    presign: TAssetPresigner<TPayload, TContext>;
    /**
     * How the request body becomes the files to sign and the context the presign service gets (and the user a token is issued for).
     * It may ask the application something (read a row, check a tenant): throw the application's own error to refuse.
     *
     * @default the body `{ files: [{ fileName, contentType?, size }] }`, a `contentType` of `application/octet-stream` when absent, and the
     * caller from `authorize` unchanged as the presign context (so `TContext` is `TCaller`)
     */
    request?: {
        /** The body schema, validated before `toInput` runs and published in the OpenAPI document. */
        schema: z.ZodType<TBody>;
        toInput: (opts: {
            body: TBody;
            /** What `authorize` answered. */
            context: TCaller;
        }) => ValueOrPromise<IAssetPresignRequest<TContext>>;
    };
    /**
     * How the results become the response body.
     *
     * @default the results as the presign service answers them: `[{ preSignUrl, fileKeyToken, key }]`
     */
    response?: {
        /** The response schema, published in the OpenAPI document. */
        schema: z.ZodType;
        map: (opts: {
            results: IAssetPresignResult[];
            context: TCaller;
        }) => unknown;
    };
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TListQuery`

*type*

Query of the list objects route. Every value arrives as a string.

```ts
export type TListQuery = {
    prefix?: string;
    recursive?: string;
    maxKeys?: string;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TMetaLink`

*type*

A MetaLink row as selected from the table.

```ts
export type TMetaLink = TTableObject<TMetaLinkSchema>;
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `TMetaLinkCompatibleSchema`

*type*

Any table whose row carries the MetaLink fields. The component reads and writes the ROW, so the table is free to carry another name or to live in another Postgres schema.

```ts
export type TMetaLinkCompatibleSchema = TTableSchemaWithId & {
    $inferSelect: TMetaLink;
};
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `TMetaLinkConfig`

*type*

The MetaLink table belongs to the application. `Schema` defaults to the table IGNIS ships, and widens to any table whose row carries the same fields.

```ts
export type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
    model: TValueOrAsyncResolver<typeof BaseRelationalEntity<Schema>>;
    repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
    createMetaLink?: (opts: {
        uploadResult: IUploadResult;
        fileStat: IFileStat;
        /** The caller's labels. Named for where they used to travel - they arrive in the request BODY now, as form fields on an upload. */
        query: TUploadQuery;
    }) => ValueOrPromise<{
        count: number;
        data: TTableObject<Schema>;
    }>;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TMetaLinkRecreateAction`

*type*

One of the `MetaLinkRecreateActions` values.

```ts
export type TMetaLinkRecreateAction = TConstValue<typeof MetaLinkRecreateActions>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `TMetaLinkSchema`

*type*

The table schema of `BaseMetaLinkModel`.

```ts
export type TMetaLinkSchema = typeof BaseMetaLinkModel.schema;

/** One row per (object, owner) pairing, NOT per object: one product image attached to the product and to each variant is the common case, so `(bucketName, objectName)` is indexed and deliberately NOT unique. */
export declare class BaseMetaLinkModel extends BaseRelationalEntity<typeof BaseMetaLinkModel.schema> {
    static schema: import("drizzle-orm/pg-core").PgTableWithColumns<{
        name: "MetaLink";
        schema: undefined;
        columns: {
            bucketName: import("drizzle-orm/pg-core").PgColumn<{
                name: "bucket_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            objectName: import("drizzle-orm/pg-core").PgColumn<{
                name: "object_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            link: import("drizzle-orm/pg-core").PgColumn<{
                name: "link";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            mimetype: import("drizzle-orm/pg-core").PgColumn<{
                name: "mimetype";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            size: import("drizzle-orm/pg-core").PgColumn<{
                name: "size";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            etag: import("drizzle-orm/pg-core").PgColumn<{
                name: "etag";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            metadata: import("drizzle-orm/pg-core").PgColumn<{
                name: "metadata";
                tableName: "MetaLink";
                dataType: "json";
                columnType: "PgJsonb";
                data: Record<string, any>;
                driverParam: unknown;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                $type: Record<string, any>;
            }>;
            storageType: import("drizzle-orm/pg-core").PgColumn<{
                name: "storage_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            isSynced: import("drizzle-orm/pg-core").PgColumn<{
                name: "is_synced";
                tableName: "MetaLink";
                dataType: "boolean";
                columnType: "PgBoolean";
                data: boolean;
                driverParam: boolean;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            variant: import("drizzle-orm/pg-core").PgColumn<{
                name: "variant";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            sequence: import("drizzle-orm/pg-core").PgColumn<{
                name: "sequence";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalType: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalId: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            createdAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            modifiedAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            id: import("drizzle-orm/pg-core").PgColumn<{
                name: "id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: true;
                isAutoincrement: false;
                hasRuntimeDefault: true;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
        } | {
            bucketName: import("drizzle-orm/pg-core").PgColumn<{
                name: "bucket_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            objectName: import("drizzle-orm/pg-core").PgColumn<{
                name: "object_name";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            link: import("drizzle-orm/pg-core").PgColumn<{
                name: "link";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            mimetype: import("drizzle-orm/pg-core").PgColumn<{
                name: "mimetype";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            size: import("drizzle-orm/pg-core").PgColumn<{
                name: "size";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            etag: import("drizzle-orm/pg-core").PgColumn<{
                name: "etag";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            metadata: import("drizzle-orm/pg-core").PgColumn<{
                name: "metadata";
                tableName: "MetaLink";
                dataType: "json";
                columnType: "PgJsonb";
                data: Record<string, any>;
                driverParam: unknown;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                $type: Record<string, any>;
            }>;
            storageType: import("drizzle-orm/pg-core").PgColumn<{
                name: "storage_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            isSynced: import("drizzle-orm/pg-core").PgColumn<{
                name: "is_synced";
                tableName: "MetaLink";
                dataType: "boolean";
                columnType: "PgBoolean";
                data: boolean;
                driverParam: boolean;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            variant: import("drizzle-orm/pg-core").PgColumn<{
                name: "variant";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            sequence: import("drizzle-orm/pg-core").PgColumn<{
                name: "sequence";
                tableName: "MetaLink";
                dataType: "number";
                columnType: "PgInteger";
                data: number;
                driverParam: string | number;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalType: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_type";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            principalId: import("drizzle-orm/pg-core").PgColumn<{
                name: "principal_id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: false;
                hasDefault: false;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
            createdAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            modifiedAt: import("drizzle-orm/pg-core").PgColumn<{
                name: string;
                tableName: "MetaLink";
                dataType: "custom";
                columnType: "PgCustomColumn";
                data: string | import("@venizia/ignis-filter").TIsoTimestamp;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: false;
                isAutoincrement: false;
                hasRuntimeDefault: false;
                enumValues: undefined;
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {
                pgColumnBuilderBrand: "PgCustomColumnBuilderBrand";
            }>;
            id: import("drizzle-orm/pg-core").PgColumn<{
                name: "id";
                tableName: "MetaLink";
                dataType: "string";
                columnType: "PgText";
                data: string;
                driverParam: string;
                notNull: true;
                hasDefault: true;
                isPrimaryKey: true;
                isAutoincrement: false;
                hasRuntimeDefault: true;
                enumValues: [string, ...string[]];
                baseColumn: never;
                identity: undefined;
                generated: undefined;
            }, {}, {}>;
        };
        dialect: "pg";
    }>;
    static relations: () => never[];
}
```

Source: `packages/core-server/src/components/static-asset/models/base.model.ts`

## `TObjectNameResolver`

*type*

Decides the key one uploaded file is stored under. `defaultKey` is what IGNIS would have written.

```ts
export type TObjectNameResolver = (opts: {
    bucket: IBucketRef;
    file: TUploadNaming;
    defaultKey: string;
}) => string;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TObjectParams`

*type*

Path parameters of the object routes.

```ts
export type TObjectParams = {
    bucketName: string;
    objectName: string;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TPresignRequestBody`

*type*

Body of the presign route when the application configures none: the files the client intends to upload.

```ts
export type TPresignRequestBody = {
    files: Array<{
        fileName: string;
        contentType?: string;
        size: number;
    }>;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetExtraOptions`

*type*

Per-controller upload tuning: multipart parsing, name and link normalization, folder depth and size ceiling.

```ts
export type TStaticAssetExtraOptions = {
    parseMultipartBody?: {
        storage?: TMultipartStorage;
        uploadDir?: string;
        /**
         * The most file parts one upload request may carry; more is refused with 413 before anything is written.
         *
         * @default DEFAULT_MAX_UPLOAD_FILES (20)
         */
        maxFiles?: number;
    };
    /** `folderPath` carries the upload query's target folder - dropping it flattens nested uploads. */
    normalizeNameFn?: (opts: {
        file: TUploadNaming;
    }) => string;
    normalizeLinkFn?: (opts: IObjectLocation) => string;
    /**
     * Maximum folder nesting depth allowed in object paths.
     *
     * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
     */
    maxFolderDepth?: number;
    /** Largest file the UPLOAD route accepts. Absent means no ceiling. Checked against `content-length` before spooling, then per file after parsing. */
    maxBytes?: number;
    [key: string]: AnyType;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetRouteConfig`

*type*

The part of a built-in route an application may change.

```ts
export type TStaticAssetRouteConfig = Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>> & {
    /**
     * Whether this route is registered.
     *
     * @default true
     */
    enabled?: boolean;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetRoutes`

*type*

Per-route overrides for the built-in routes of a generated asset controller. A key left out keeps that route as built.

```ts
export type TStaticAssetRoutes = {
    getBuckets?: TStaticAssetRouteConfig;
    getBucketByName?: TStaticAssetRouteConfig;
    createBucket?: TStaticAssetRouteConfig;
    deleteBucket?: TStaticAssetRouteConfig;
    upload?: TStaticAssetRouteConfig;
    listObjects?: TStaticAssetRouteConfig;
    deleteObject?: TStaticAssetRouteConfig;
    getObjectByName?: TStaticAssetRouteConfig;
    downloadObjectByName?: TStaticAssetRouteConfig;
    uploadPresign?: TStaticAssetRouteConfig;
    recreateMetaLink?: TStaticAssetRouteConfig;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetsComponentOptions`

*type*

Static asset controllers keyed by an application-chosen name. Each entry pairs a storage type with its matching helper, and `useMetaLink: true` requires a `metaLink` config.

```ts
export type TStaticAssetsComponentOptions<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
    [key: string]: {
        controller: {
            name: string;
            basePath: string;
            /**
             * Whether `/path` and `/path/` are different routes on this controller.
             *
             * @default true
             */
            isStrict?: boolean;
            /**
             * `true` serves a raw nested object path (`/objects/photos/2024/f.jpg`) - a URL shape change; a percent-encoded path keeps working either way.
             *
             * @default false
             */
            rawObjectPath?: boolean;
            /** The single bucket every object route uses. It leaves the URL (`/objects/{objectName}`) and the four bucket-management routes are not registered. The function form is read per request, so an environment variable can be read lazily. */
            bucket?: TValueOrAsyncResolver<string>;
            /**
             * The key scope this controller owns, e.g. `inventory/`. Every route refuses a key outside it
             * as a 404 without calling the storage, `listObjects` lists only inside it, and an upload key
             * must land inside it: the default name is placed there, a `resolveObjectName` or
             * `extra.normalizeNameFn` key outside it is refused. `maxFolderDepth` counts the folders below
             * it.
             *
             * @default every key in the bucket
             */
            keyPrefix?: string;
            routes?: TStaticAssetRoutes;
            /** Presigned-PUT upload: the browser PUTs the bytes straight to the storage and this route only signs the permission. Absent leaves the route unregistered. */
            directUpload?: TDirectUploadOptions<AnyType, AnyType, AnyType, AnyType>;
            /** A proxy for presigned storage URLs, switched on by `proxy.enable`. Absent registers no proxy route. */
            proxy?: IAssetProxyOptions;
        };
        extra?: TStaticAssetExtraOptions;
        /** Decides the stored object name of each uploaded file; absent keeps the storage helper's own naming. */
        resolveObjectName?: TObjectNameResolver;
        /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. Hono matches in registration order. */
        defineRoutesBefore?: TDefineExtraRoutes;
        /** Registers the application's own routes on the generated controller, after every built-in one. */
        defineExtraRoutes?: TDefineExtraRoutes;
    } & ({
        storage: typeof StaticAssetStorageTypes.BUN_S3;
        helper: BunS3Helper;
    } | {
        storage: typeof StaticAssetStorageTypes.DISK;
        helper: DiskHelper;
    }) & ({
        useMetaLink?: false | undefined;
    } | {
        useMetaLink: true;
        metaLink: TMetaLinkConfig<Schema>;
    });
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetStorageType`

*type*

One of the `StaticAssetStorageTypes` values.

```ts
export type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `TUploadQuery`

*type*

Labels recorded on the MetaLink row of an uploaded object.

```ts
export type TUploadQuery = {
    principalType?: string;
    principalId?: string;
    variant?: string;
    /** Display order within the principal. Caller-supplied: deriving it would be a non-atomic read of `max(sequence)` then a write of `max + 1`. */
    sequence?: number;
    folderPath?: string;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `WHITELIST_HEADERS`

*const*

`content-type` is absent on purpose: it is decided from the object name, never from the backend.

```ts
export declare const WHITELIST_HEADERS: readonly ["content-encoding", "cache-control", "etag", "last-modified"];
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`
