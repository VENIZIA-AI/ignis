---
title: "@venizia/ignis/static-asset (3 of 3)"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset (3 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 3 of [`@venizia/ignis/static-asset`](/references/api/venizia-ignis-static-asset).

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
                data: Record<string, unknown>;
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
                $type: Record<string, unknown>;
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
                data: Record<string, unknown>;
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
                $type: Record<string, unknown>;
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

## `TStaticAssetAuth`

*type*

Authentication and authorization for every built-in route of an entry; a route's own `authenticate`/`authorize` replaces it for that route.

```ts
export type TStaticAssetAuth = TRouteAuthConfig & {
    /**
     * `{ use: true }` leaves `getObjectByName` and `downloadObjectByName` unauthenticated, so a
     * browser can show an image without a token. `listObjects` is NOT public: listing a bucket is not
     * reading an object.
     *
     * @default { use: false }
     */
    publicRead?: TToggle;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetComponentOptions`

*type*

Static asset entries keyed by an application-chosen name; each key becomes one controller.

```ts
export type TStaticAssetComponentOptions<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = Record<string, TStaticAssetEntry<Schema>>;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetDefineExtraRoutes`

*type*

Adds routes of the application's own. Registration order decides a path collision, so the same shape serves both the before and the after hook.

```ts
export type TStaticAssetDefineExtraRoutes = (opts: {
    controller: BaseRestController;
    helper: IStorageHelper;
    basePath: string;
}) => void;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetDirectUploadOptions`

*type*

Enables the signed-policy upload flow, where the client posts bytes straight to the storage and IGNIS only signs the permission and verifies the commit.

```ts
export type TStaticAssetDirectUploadOptions = {
    /**
     * Who may use direct upload. Guards every direct-upload route. There is no safe default for a
     * route that hands out a write credential, so leaving it out is allowed only when the entry's
     * `auth` already authenticates or authorizes: then `auth` is the gate. With neither, the
     * component refuses to start.
     */
    authorize?: (opts: {
        context: TRouteContext;
    }) => ValueOrPromise<boolean>;
    /** What the application decides about an upload; `owner` is required, the rest is optional. */
    resolvers: TStaticAssetDirectUploadResolvers;
    /** Signs the commit token. Keep it out of the repository and out of the client. */
    secretKey: string;
    /** The ceiling the policy carries as `content-length-range`. A signed PUT cannot express this at all, which is why this is a POST policy. */
    maxBytes: number;
    /**
     * The most files one upload-policy request may name; more is a 422.
     *
     * @default StaticAssetDefaults.MAX_UPLOAD_FILES (20)
     */
    maxFiles?: number;
    /**
     * Where a policy may write: not empty, ends with `/`, made of valid key segments, and neither
     * inside the entry's `keyPrefix` nor containing it - a pending object must never be readable
     * through the entry's own routes. The final key is NEVER in a policy, so content cannot be
     * replaced after the commit. The lifecycle rule that collects abandoned uploads targets this prefix.
     *
     * @default 'pending/'
     */
    pendingPrefix?: string;
    expires?: {
        /**
         * How long the browser may post the bytes: the POST policy's lifetime.
         *
         * @default StoragePresignDefaults.POST_EXPIRES_IN
         */
        upload?: IDuration;
        /**
         * How long the commit token stays good, for validating and committing after the upload. The
         * pending object must outlive it, so the lifecycle rule on `pendingPrefix` has to be longer still.
         *
         * @default `upload`
         */
        commit?: IDuration;
    };
    /**
     * Checks the pending file. On, the component registers `POST {base}/upload-validate`, which
     * answers the token `commit` takes, and `commit` accepts no other.
     * Build it with `StaticAssetValidation.define`.
     */
    validation: TToggle<IStaticAssetValidation<z.ZodType>>;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetDirectUploadResolvers`

*type*

The decisions of a direct upload that belong to the application, each made on a different call.

```ts
export type TStaticAssetDirectUploadResolvers = {
    /**
     * Who the upload belongs to. Called on every direct-upload route: the policy route signs the
     * answer into the commit token, and the other routes refuse a token whose owner differs.
     */
    owner: (opts: {
        context: TRouteContext;
    }) => ValueOrPromise<string>;
    /** Per file, at policy time: what the token signs for it, readable again at validate and commit. Absent, a client that sends `metadata` is refused. */
    metadata?: (opts: {
        context: TRouteContext;
        file: TStaticAssetUploadPolicyFile;
    }) => ValueOrPromise<TStaticAssetTokenMetadata>;
    commit?: {
        /** At commit time: the final key, in the same bucket and inside the `keyPrefix`. Absent keeps `defaultKey`. */
        destination?: (opts: {
            owner: string;
            metadata: TStaticAssetTokenMetadata;
            file: {
                fileName: string;
            };
            defaultKey: string;
        }) => ValueOrPromise<{
            key: string;
        }>;
    };
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetEntry`

*type*

One storage backend with its generated controller. Every switch is a toggle; a toggle left out is a type error, so nothing is on or off by accident.

```ts
export type TStaticAssetEntry<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
    basePath: string;
    /** The controller's name. Absent, it is derived from the entry's key. */
    name?: string;
    /** The single bucket every route uses. The function form is read per request, so an environment variable can be read lazily. */
    bucket: TValueOrAsyncResolver<string>;
    /**
     * The key scope this entry owns, e.g. `inventory/`. Every route refuses a key outside it as a
     * 404 without calling the storage, `listObjects` lists only inside it, and an upload key must
     * land inside it. `maxFolderDepth` counts the folders below it. Required with
     * `directUpload`: it keeps the pending prefix outside everything the routes serve.
     *
     * @default every key in the bucket
     */
    keyPrefix?: string;
    /**
     * Folders a key may nest below the `keyPrefix`, for every route of the entry: reads and deletes
     * too, so it holds for keys that arrive by direct upload or ingest.
     *
     * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
     */
    maxFolderDepth?: number;
    /**
     * `true` serves a raw nested object path (`/objects/photos/2024/f.jpg`) - a URL shape change; a percent-encoded path keeps working either way.
     *
     * @default false
     */
    rawObjectPath?: boolean;
    /** The link stored and returned for an object. Absent builds the URL of this controller's own object route. */
    link?: (opts: IObjectLocation) => string;
    /** Authentication and authorization of every built-in route of this entry. Absent leaves every route open; `publicRead` is the only way a read route is public on purpose. */
    auth?: TStaticAssetAuth;
    serverUpload: TToggle<TStaticAssetServerUploadOptions>;
    /** Every upload also writes a MetaLink row, and the object's deletion removes it. */
    metaLink: TToggle<TMetaLinkConfig<Schema>>;
    routes?: TStaticAssetRoutes;
    extend?: {
        /** Registered BEFORE every built-in route, so a literal path wins over the catch-all `rawObjectPath` produces. Hono matches in registration order. */
        before?: TStaticAssetDefineExtraRoutes;
        /** Registered after every built-in route. */
        after?: TStaticAssetDefineExtraRoutes;
    };
} & TStaticAssetStorage;

/** The storage helper decides which direct upload shapes are possible. */
type TStaticAssetStorage = ({
    helper: BunS3Helper;
} & TStaticAssetDirectUploadScope) | {
    helper: DiskHelper;
    keyPrefix?: string;
    directUpload: {
        use: false;
    };
};

/** Direct upload is a POST policy, which only S3 can sign, and its pending objects stay out of the served scope only when the entry has a `keyPrefix`. */
type TStaticAssetDirectUploadScope = {
    keyPrefix?: string;
    directUpload: {
        use: false;
    };
} | {
    keyPrefix: string;
    directUpload: {
        use: true;
    } & TStaticAssetDirectUploadOptions;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetObjectKeyResolver`

*type*

Decides the key one uploaded file is stored under. `defaultKey` is what IGNIS would have written - the scope and the default naming - so the hook may keep it, extend it or ignore it.

```ts
export type TStaticAssetObjectKeyResolver = (opts: {
    bucket: IBucketRef;
    file: TUploadNaming;
    defaultKey: string;
}) => string;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetObjectParams`

*type*

Path parameters of the object routes.

```ts
export type TStaticAssetObjectParams = {
    objectName: string;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetRouteConfig`

*type*

The part of a built-in route an application may change. `authenticate` and `authorize` replace the entry's `auth` for this route, and `{ skip: true }` leaves it open.

```ts
export type TStaticAssetRouteConfig = Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses' | 'authenticate' | 'authorize'>> & TRouteAuthConfig;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetRouteKey`

*type*

The name of a built-in route, the key of `routes`.

```ts
export type TStaticAssetRouteKey = TConstValue<typeof StaticAssetRouteKeys>;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetRoutes`

*type*

What each built-in route does: `{ use: false }` turns it off, `{ use: true, ... }` turns it on
with those overrides. A route left out is on as built.

```ts
export type TStaticAssetRoutes = Partial<Record<TStaticAssetRouteKey, TToggle<TStaticAssetRouteConfig>>>;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetServerUploadOptions`

*type*

Uploading through the application: the browser sends the bytes to `POST /objects` and the application writes them to the storage.

```ts
export type TStaticAssetServerUploadOptions = {
    /** Largest file the route accepts. Absent means no ceiling. Checked against `content-length` before the body is read, then per file after parsing. */
    maxBytes?: number;
    /**
     * The most file parts one request may carry; more is refused with 413 before anything is written.
     *
     * @default StaticAssetDefaults.MAX_UPLOAD_FILES (20)
     */
    maxFiles?: number;
    /** The one hook that decides the key an uploaded file is stored under. Absent keeps the default naming. Under a `keyPrefix` a key outside the scope is refused, never rewritten. */
    objectKey?: TStaticAssetObjectKeyResolver;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetStorageType`

*type*

The storage backends a static asset entry can serve from: the helpers that declare one.

```ts
export type TStaticAssetStorageType = typeof StorageTypes.DISK | typeof StorageTypes.BUN_S3;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetTokenMetadata`

*type*

Application-chosen strings the commit token signs for one file. The token is signed, not encrypted: no secrets.

```ts
export type TStaticAssetTokenMetadata = Record<string, string>;
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetTokenStage`

*type*

One of the `StaticAssetTokenStages` values.

```ts
export type TStaticAssetTokenStage = TConstValue<typeof StaticAssetTokenStages>;
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `TStaticAssetUploadLabels`

*type*

Labels recorded on the MetaLink row of an uploaded object.

```ts
export type TStaticAssetUploadLabels = {
    principalType?: string;
    principalId?: string;
    variant?: string;
    /** Display order within the principal. Caller-supplied: deriving it would be a non-atomic read of `max(sequence)` then a write of `max + 1`. */
    sequence?: number;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetUploadPolicy`

*type*

What the client posts to the storage, plus the key it lands under and the token that commits it.

```ts
export type TStaticAssetUploadPolicy = IPostPolicy & {
    objectName: string;
    commitToken: string;
};
```

Source: `packages/core-server/src/components/static-asset/services/policy.service.ts`

## `TStaticAssetUploadPolicyFile`

*type*

One file of an upload-policy request. `metadata` is the client's hint: `resolvers.metadata` reads it, and only what that returns is signed.

```ts
export type TStaticAssetUploadPolicyFile = {
    fileName: string;
    contentType?: string;
    size?: number;
    metadata?: TStaticAssetTokenMetadata;
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `TStaticAssetUploadPolicyRequest`

*type*

Body of the upload policy route: the files the client intends to upload.

```ts
export type TStaticAssetUploadPolicyRequest = {
    files: TStaticAssetUploadPolicyFile[];
};
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`
