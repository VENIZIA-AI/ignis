---
title: "@venizia/ignis/static-asset"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

41 exports, 41 with TSDoc.

## `AssetCommitToken`

*class*

Signs and reads the token the commit route trusts instead of a key a caller names.

```ts
export declare class AssetCommitToken {
    private static encode;
    private static sign;
    /** Signs `{ bucket, key, expiresAt }` so the commit route can trust the key it is handed. */
    static build(opts: {
        payload: ICommitTokenPayload;
        secretKey: string;
    }): string;
    /**
     * Reads a commit token back, or throws.
     *
     * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a
     * name prober: a forged token fails without a round trip, so timing says nothing about what exists.
     */
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

## `AssetDirectUploadService`

*class*

The signed-policy upload flow, callable without a request: the controller's two routes and an
application service run the same code. A service that saves its own record commits the upload in
the same call instead of asking the client for a second request.

Authorization is NOT here. `issuePolicies` hands out a write credential, and who may ask for one is
the route's `directUpload.authorize`; a caller that reaches this class directly has decided that
for itself.

```ts
export declare class AssetDirectUploadService extends BaseService {
    private readonly options;
    private readonly pendingPrefix;
    private readonly policyKeyPrefix;
    private readonly basePath;
    private readonly keyPrefix?;
    constructor(opts: IAssetDirectUploadServiceOptions);
    /** One signed policy per file. A size over `maxBytes` is refused before any policy is signed. */
    issuePolicies(opts: {
        files: TUploadPolicyRequest['files'];
    }): Promise<TAssetUploadPolicy[]>;
    /** Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the row. A MetaLink failure rides the result as a code: the object IS committed by then. */
    commit(opts: {
        commitToken: string;
        labels?: TUploadQuery;
    }): Promise<IAssetCommitResult>;
}
```

Source: `packages/core-server/src/components/static-asset/services/direct-upload.service.ts`

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

## `DEFAULT_PENDING_PREFIX`

*const*

Where a signed policy may write. The final key is never inside it, so content cannot be replaced after the commit.

```ts
export declare const DEFAULT_PENDING_PREFIX = "pending/";
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `IAssetCommitResult`

*interface*

What a commit answers. `metaLink` is absent when the entry keeps no MetaLink table.

```ts
export interface IAssetCommitResult {
    bucket: IBucketRef;
    object: IObjectRef;
    link: string;
    metaLink?: IUploadResult['metaLink'];
}
```

Source: `packages/core-server/src/components/static-asset/services/direct-upload.service.ts`

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
    /** The instance the direct upload routes run, so a service resolving it from the container and the routes share one. Absent builds one from `controller.directUpload`; the component passes the one it bound. */
    directUploadService?: AssetDirectUploadService;
    /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
    resolveObjectName?: TObjectNameResolver;
    /** Registers the application's own routes on the generated controller, after every built-in one. */
    /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
    defineRoutesBefore?: TDefineExtraRoutes;
    defineExtraRoutes?: TDefineExtraRoutes;
}
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `IAssetDirectUploadServiceOptions`

*interface*

What an `AssetDirectUploadService` needs, all of it one options entry already carries.

```ts
export interface IAssetDirectUploadServiceOptions {
    /** Names the logger; the controller's own name is the usual value. */
    scope: string;
    helper: IStorageHelper;
    /** A policy names ONE bucket, so a direct upload has no bucket in its URL. */
    bucket: TValueOrAsyncResolver<string>;
    /** The controller's `keyPrefix` as configured; this class normalizes it the way the controller does. */
    keyPrefix?: string;
    directUpload: TDirectUploadOptions;
    storage: TStaticAssetStorageType;
    useMetaLink?: boolean;
    /** The table is erased here for the reason it is at the controller seam: this class only reads and writes MetaLink columns. */
    metaLink?: TMetaLinkConfig<AnyType>;
    /** The controller mount path, the base of the link a commit returns. */
    basePath: string;
    rawObjectPath?: boolean;
}
```

Source: `packages/core-server/src/components/static-asset/services/direct-upload.service.ts`

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
    /** One instance per entry that turns direct upload on. The routes run the very object an application's service resolves from the key. An entry without a bucket binds nothing: the controller refuses it, with the reason. */
    private bindDirectUpload;
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
    /** The `AssetDirectUploadService` of one options entry, bound only for an entry that sets `controller.directUpload`. `name` is the entry's KEY in the options object, not the controller name. */
    static directService(opts: {
        name: string;
    }): string;
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
            readonly text: "Not allowed to request an upload policy";
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

## `TAssetUploadPolicy`

*type*

What the client posts to the storage, plus the key it lands under and the token that commits it.

```ts
export type TAssetUploadPolicy = IPostPolicy & {
    objectName: string;
    commitToken: string;
};
```

Source: `packages/core-server/src/components/static-asset/services/direct-upload.service.ts`

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

Enables the signed-policy upload flow, where the client posts bytes straight to the storage and IGNIS only signs the permission and verifies the commit.

```ts
export type TDirectUploadOptions = {
    /** Who may ask for a policy. REQUIRED, not defaulted: this route hands out a write credential, and there is no safe default for that. */
    authorize: (opts: {
        context: TRouteContext;
    }) => ValueOrPromise<boolean>;
    /** Signs the commit token. Keep it out of the repository and out of the client. */
    secretKey: string;
    /** The ceiling the policy carries as `content-length-range`. A signed PUT cannot express this at all, which is why this is a POST policy. */
    maxBytes: number;
    /**
     * Where a policy may write. The final key is NEVER in a policy, so content cannot be replaced after the commit.
     *
     * @default 'pending/'
     */
    pendingPrefix?: string;
    /**
     * How long a policy and its commit token stay good.
     *
     * @default StoragePresignDefaults.POST_EXPIRES_IN
     */
    expiresIn?: IDuration;
    /** Runs BEFORE the copy to the final key, so a hook that throws leaves the object under the pending prefix for a lifecycle rule to collect, rather than stranding it at the final key. */
    onCommit?: (opts: {
        bucket: IBucketRef;
        pendingObject: IObjectRef;
        object: IObjectRef;
    }) => ValueOrPromise<void>;
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
        /** The caller's labels. Named for where they used to travel - they arrive in the request BODY now, as form fields on an upload and beside the commit token on a direct one. */
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

## `TStaticAssetExtraOptions`

*type*

Per-controller upload tuning: multipart parsing, name and link normalization, folder depth and size ceiling.

```ts
export type TStaticAssetExtraOptions = {
    parseMultipartBody?: {
        storage?: TMultipartStorage;
        uploadDir?: string;
        /**
         * The most file parts one upload request may carry; more is refused with 413 before anything is written. The upload-policy request is bounded by the same number (more is a 422).
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
    uploadPolicy?: TStaticAssetRouteConfig;
    uploadCommit?: TStaticAssetRouteConfig;
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
            /** Direct upload: the browser posts the bytes to the storage and IGNIS only signs the permission. Absent leaves both routes unregistered. Requires `bucket` - a policy names one bucket, and a bucket in the URL is a bucket the caller chooses. */
            directUpload?: TDirectUploadOptions;
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

## `TUploadPolicyRequest`

*type*

Body of the upload policy route: the files the client intends to upload.

```ts
export type TUploadPolicyRequest = {
    files: Array<{
        fileName: string;
        contentType?: string;
        size?: number;
    }>;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

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
