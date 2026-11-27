---
title: "@venizia/ignis/static-asset (1 of 3)"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset (1 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 3 of [`@venizia/ignis/static-asset`](/references/api/venizia-ignis-static-asset).

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

## `BaseMetaLinkRepository`

*class*

Base MetaLink repository - bind a model + datasource via @repository in a subclass.

```ts
export declare class BaseMetaLinkRepository extends DefaultCRUDRepository<typeof BaseMetaLinkModel.schema> {
}
```

Source: `packages/core-server/src/components/static-asset/repositories/base.repository.ts`

## `IMetaLinkRepository`

*interface*

The repository verbs the component calls, on MetaLink rows. A `DefaultCRUDRepository` over any `TMetaLinkCompatibleSchema` table satisfies it, and so does a small fake in a test. The contract checks the select row only (see the static-asset usage page for what that leaves to the table).

```ts
export interface IMetaLinkRepository {
    create(opts: {
        data: TTableInsert<TMetaLinkSchema>;
    }): Promise<{
        count: number;
        data: TMetaLink;
    }>;
    updateBy(opts: {
        data: Partial<TTableInsert<TMetaLinkSchema>>;
        where: TWhere<TMetaLink>;
    }): Promise<{
        count: number;
        data: TMetaLink[] | null;
    }>;
    updateById(opts: {
        id: string;
        data: Partial<TTableInsert<TMetaLinkSchema>>;
    }): Promise<{
        count: number;
        data: TMetaLink;
    }>;
    deleteBy(opts: {
        where: TWhere<TMetaLink>;
    }): Promise<{
        count: number;
    }>;
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `IStaticAssetCommitResult`

*interface*

What a commit answers. `metaLink` is absent when the entry keeps no MetaLink table.

```ts
export interface IStaticAssetCommitResult {
    bucket: IBucketRef;
    object: IObjectRef;
    owner: string;
    metadata: TStaticAssetTokenMetadata;
    link: string;
    metaLink?: IUploadResult['metaLink'];
}
```

Source: `packages/core-server/src/components/static-asset/services/commitment.service.ts`

## `IStaticAssetCommitTokenPayload`

*interface*

What a commit token binds: the pending object a policy was issued for, when the grant dies and,
who it was issued to and the application's own metadata for the file.

```ts
export interface IStaticAssetCommitTokenPayload {
    bucket: IBucketRef;
    object: IObjectRef;
    expiresAt: number;
    /** The token commits only for this owner. */
    owner: string;
    /** What `resolvers.metadata` returned for the file; `{}` without one. Signed, not encrypted. */
    metadata: TStaticAssetTokenMetadata;
    stage: TStaticAssetTokenStage;
    /** Present from `VALIDATED` on: `commit` copies only content that still matches it. */
    pin?: IStaticAssetPin;
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `IStaticAssetControllerOptions`

*interface*

Input of `StaticAssetControllerFactory.build`: one entry of `TStaticAssetComponentOptions` and its key.

```ts
export interface IStaticAssetControllerOptions<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> {
    /** The entry's key in the options object: the controller's name is derived from it. */
    key: string;
    entry: TStaticAssetEntry<Schema>;
    /** What the direct upload routes run: the instances the component bound, so an application service resolving them from the container and the routes share them. Required when the entry turns `directUpload` on. */
    policyService?: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
    commitService?: Pick<StaticAssetUploadCommitService<Schema>, 'commit' | 'validate'>;
}
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `IStaticAssetIngestFromUrlOptions`

*interface*

Where a fetched object lands, and what it is attached to.

```ts
export interface IStaticAssetIngestFromUrlOptions {
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

Source: `packages/core-server/src/components/static-asset/utilities/ingest.utility.ts`

## `IStaticAssetIngestFromUrlResult`

*interface*

What was stored, and what the backend reports about it. The stat is returned because `getStat`
already ran to size the result - a caller writing its own row would otherwise pay for it twice.

This does NOT write a meta link. The columns an application attaches to an object - a principal,
a variant - come from its own domain, not from the object, so the row stays the caller's.

```ts
export interface IStaticAssetIngestFromUrlResult {
    upload: IUploadResult;
    stat: IFileStat;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/ingest.utility.ts`

## `IStaticAssetPin`

*interface*

The content a validation read: the ETag, and the version id when the storage has real versions.

```ts
export interface IStaticAssetPin {
    etag: string;
    versionId?: string;
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `IStaticAssetUploadCommitServiceOptions`

*interface*

`Schema` is the MetaLink table the application bound, the same type parameter the component carries.

```ts
export interface IStaticAssetUploadCommitServiceOptions<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> {
    /** Names the logger; the controller's own name is the usual value. */
    scope: string;
    helper: IStorageHelper;
    /** The bucket the entry resolves; a token naming another is refused. */
    bucket: TValueOrAsyncResolver<string>;
    /** The entry's `keyPrefix` as configured; normalized here the way the controller does. */
    keyPrefix: string;
    /** Folders a final key may nest, the scope's own included. */
    objectKeyMaxDepth: number;
    directUpload: Pick<TStaticAssetDirectUploadOptions, 'secretKey' | 'pendingPrefix' | 'resolvers'> & {
        /** Absent, every file is valid. */
        validation?: IStaticAssetValidation<z.ZodType>;
    };
    storage: TStaticAssetStorageType;
    metaLink?: TMetaLinkConfig<Schema>;
    /** The link a commit returns for the committed object: the entry's own, so a commit and an upload agree. */
    link: (opts: IObjectLocation) => string;
}
```

Source: `packages/core-server/src/components/static-asset/services/commitment.service.ts`

## `IStaticAssetUploadPolicyServiceOptions`

*interface*

What an `StaticAssetUploadPolicyService` needs, all of it one options entry already carries.

```ts
export interface IStaticAssetUploadPolicyServiceOptions {
    /** Names the logger; the controller's own name is the usual value. */
    scope: string;
    helper: IStorageHelper;
    /** A policy names ONE bucket, so a direct upload has no bucket in its URL. */
    bucket: TValueOrAsyncResolver<string>;
    /** The entry's `keyPrefix` as configured; normalized here the way the controller does. Required: it keeps the pending prefix out of everything the routes serve. */
    keyPrefix: string;
    directUpload: Pick<TStaticAssetDirectUploadOptions, 'maxBytes' | 'expires' | 'secretKey' | 'pendingPrefix'>;
}
```

Source: `packages/core-server/src/components/static-asset/services/policy.service.ts`

## `IStaticAssetValidateResult`

*interface*

What `validate` answers. `commitToken` is present only when the file is valid: it is the token `commit` takes.

```ts
export interface IStaticAssetValidateResult<Issue> extends IStaticAssetValidationResult<Issue> {
    commitToken?: string;
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `IStaticAssetValidation`

*interface*

The application's own check of an uploaded file, run on the PENDING object before anything is
committed. The component owns the route and the refusal; the application owns only this logic.
Build it with `StaticAssetValidation.define` so the handler is typed by `issueSchema`.

```ts
export interface IStaticAssetValidation<IssueSchema extends z.ZodType> {
    /** The shape of ONE issue. It types the handler's answer and documents the route's response. */
    issueSchema: IssueSchema;
    /** Runs once per `upload-validate`. Read the file through `file`: every read is pinned to the content `commit` will copy. */
    handler: (opts: {
        file: StaticAssetPinnedFile;
        owner: string;
        metadata: TStaticAssetTokenMetadata;
    }) => ValueOrPromise<IStaticAssetValidationResult<z.infer<IssueSchema>>>;
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `IStaticAssetValidationResult`

*interface*

What a validation answers: whether the file may be committed, and the problems the user should see.

```ts
export interface IStaticAssetValidationResult<Issue> {
    isValid: boolean;
    issues: Issue[];
}
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`

## `MetaLinkRecreateActions`

*class*

What `recreate-metalink` did: refreshed the rows of an object, or created its first one.

```ts
export declare class MetaLinkRecreateActions {
    static readonly CREATED = "created";
    static readonly REFRESHED = "refreshed";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetBindingKeys`

*class*

Container keys of the static asset component.

```ts
export declare class StaticAssetBindingKeys {
    /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
    static readonly STATIC_ASSET_OPTIONS: TBindingKey<TStaticAssetComponentOptions<TMetaLinkCompatibleSchema>>;
    /** The `StaticAssetUploadPolicyService` of one options entry, bound only for an entry that turns `directUpload` on. `name` is the entry's KEY in the options object, not the controller name. */
    static policyService(opts: {
        name: string;
    }): TBindingKey<StaticAssetUploadPolicyService>;
    /** The `StaticAssetUploadCommitService` of one options entry, bound with its policy service. */
    static commitService<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema>(opts: {
        name: string;
    }): TBindingKey<StaticAssetUploadCommitService<Schema>>;
}
```

Source: `packages/core-server/src/components/static-asset/common/keys.ts`

## `StaticAssetCommitTokenUtility`

*class*

Signs and reads the token the commit route trusts instead of a key a caller names.

```ts
export declare class StaticAssetCommitTokenUtility {
    private static encode;
    private static sign;
    private static isStringRecord;
    /** A signed body that is not the current payload shape is refused as invalid: a token minted before the shape changed still carries a good signature. */
    private static parse;
    private static parsePin;
    /** Signs the payload so the commit route can trust the key it is handed. */
    static build(opts: {
        payload: IStaticAssetCommitTokenPayload;
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
    }): IStaticAssetCommitTokenPayload;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/commit-token.utility.ts`

## `StaticAssetComponent`

*class*

`Schema` is the MetaLink table the application binds. It has to live on the CLASS, not only on the options: `component(Ctor, { options })` infers the options from the class, so a class pinned to the shipped table can only carry options for that table.

```ts
export declare class StaticAssetComponent<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> extends BaseComponent<TStaticAssetComponentOptions<Schema>> {
    private application;
    constructor(application: BaseApplication);
    binding(): ValueOrPromise<void>;
    /** One pair of services per entry that turns direct upload on. The routes run the very objects an application's service resolves from the keys. */
    private bindDirectUploadServices;
}
```

Source: `packages/core-server/src/components/static-asset/component.ts`

## `StaticAssetContentTypes`

*class*

Content types the controller serves.

```ts
export declare class StaticAssetContentTypes {
    /**
     * Types the controller will let a browser render, keyed off the object name. Anything absent here is
     * served as an attachment, because a renderable upload on the API origin is stored XSS - and `nosniff`
     * cannot stop a type we declared ourselves. `image/svg+xml` is deliberately excluded: SVG carries script.
     */
    static readonly RENDERABLE: Set<string>;
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`
