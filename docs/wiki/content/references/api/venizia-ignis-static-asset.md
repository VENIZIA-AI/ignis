---
title: "@venizia/ignis/static-asset"
description: "Every export of @venizia/ignis/static-asset, from the built declarations (generated)."
---

# `@venizia/ignis/static-asset`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

57 exports, 57 with TSDoc.

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
    static readonly STATIC_ASSET_OPTIONS = "@app/static-asset/options";
    /** The `StaticAssetUploadPolicyService` of one options entry, bound only for an entry that turns `directUpload` on. `name` is the entry's KEY in the options object, not the controller name. */
    static policyService(opts: {
        name: string;
    }): string;
    /** The `StaticAssetUploadCommitService` of one options entry, bound with its policy service. */
    static commitService(opts: {
        name: string;
    }): string;
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
    private static isRecord;
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

## `StaticAssetControllerFactory`

*class*

Builds the REST controller class for a static asset entry, and decides the served content type.

```ts
export declare class StaticAssetControllerFactory {
    /**
     * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
     * the API origin is stored XSS. Public so a hand-written route makes the same decision - the
     * backend's own content-type is dropped by `StaticAssetHeaders.ALLOWED`.
     */
    static resolveServedContentType(opts: {
        helper: IStorageHelper;
        object: IObjectRef;
    }): {
        contentType: string;
        isRenderable: boolean;
    };
    /** Resolves the entry, then builds its controller. */
    static build<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema>(opts: IStaticAssetControllerOptions<Schema>): {
        new (): {
            binding(): ValueOrPromise<void>;
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<any>;
            normalizeCountData<ResponseSchema extends unknown, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<import("hono").Env> = import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>, ResponseData extends {
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<ResponseType = unknown>(opts: {
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
            }): import("hono").Handler<import("hono").Env, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            path: string;
            definitions: Record<string, import("@venizia/ignis-kernel").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            registerRoutesFromRegistry(opts?: {
                paths?: import("@venizia/ignis-kernel").TRoutePathScope;
            }): void;
            configure(opts?: {} | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">>;
            buildRouteMiddlewares<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<import("hono").Env>[];
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
```

Source: `packages/core-server/src/components/static-asset/controller/factory.ts`

## `StaticAssetDefaults`

*class*

Defaults of the static asset component.

```ts
export declare class StaticAssetDefaults {
    /** Where a signed policy may write. The final key is never inside it, so content cannot be replaced after the commit. */
    static readonly PENDING_PREFIX = "pending/";
    /** The most file parts one upload request may carry unless `serverUpload.maxFiles` says otherwise. */
    static readonly MAX_UPLOAD_FILES = 20;
    /** The most bytes of JSON one file's signed `metadata` may take: the token travels in every request. */
    static readonly MAX_TOKEN_METADATA_BYTES = 1024;
    /** The key of the application's token metadata inside a MetaLink row's `metadata` column. */
    static readonly META_LINK_METADATA_KEY = "app";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetErrors`

*const*

Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value.

```ts
export declare const StaticAssetErrors: {
    readonly UPLOAD_NOT_AUTHORIZED: {
        readonly message: {
            readonly text: "Not allowed to upload";
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
    /** The pending object is not the one that was read: it was overwritten or removed after the pin. Raised by a pinned read and by the commit copy. */
    readonly UPLOAD_CHANGED: {
        readonly message: {
            readonly text: "The uploaded file changed after it was validated";
            readonly code: "core.static_asset.upload_changed";
        };
        readonly statusCode: 409;
        readonly category: "validation";
    };
    /** The destination already holds an object: the token was committed once, and a second commit would overwrite it. */
    readonly UPLOAD_ALREADY_COMMITTED: {
        readonly message: {
            readonly text: "The upload was already committed";
            readonly code: "core.static_asset.upload_already_committed";
        };
        readonly statusCode: 409;
        readonly category: "validation";
    };
    /** The metadata a policy would sign is not allowed: oversized, or sent by a client with no `resolvers.metadata` to read it. */
    readonly UPLOAD_METADATA_INVALID: {
        readonly message: {
            readonly text: "Invalid upload metadata";
            readonly code: "core.static_asset.upload_metadata_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    /** With a `validation` on, `commit` takes the token `upload-validate` returned, not the one the policy issued. */
    readonly UPLOAD_NOT_VALIDATED: {
        readonly message: {
            readonly text: "The upload has not been validated";
            readonly code: "core.static_asset.upload_not_validated";
        };
        readonly statusCode: 422;
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
    /** The application's naming hook produced a key outside the entry's `keyPrefix`; nothing is written. */
    readonly OBJECT_KEY_OUT_OF_SCOPE: {
        readonly message: {
            readonly text: "Object key is outside the key prefix of this controller";
            readonly code: "core.static_asset.object_key_out_of_scope";
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
};
```

Source: `packages/core-server/src/components/static-asset/common/errors.ts`

## `StaticAssetHeaders`

*class*

What a controller sends with every object.

```ts
export declare class StaticAssetHeaders {
    static readonly NOSNIFF = "nosniff";
    static readonly CSP_SANDBOX = "sandbox";
    static readonly RANGE_UNIT: "bytes";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetIngestUtility`

*class*

Storing an object that came from somewhere else.

```ts
export declare class StaticAssetIngestUtility {
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
    static fromUrl(opts: IStaticAssetIngestFromUrlOptions): Promise<IStaticAssetIngestFromUrlResult>;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/ingest.utility.ts`

## `StaticAssetMetaLinkCodes`

*class*

Codes the component reports in a body instead of throwing.

```ts
export declare class StaticAssetMetaLinkCodes {
    /** Reported in the body, never thrown: the bytes are stored, only the row is not. A CODE, because a 200 bypasses the middleware that strips the driver's `detail`/`table`/`constraint`. */
    static readonly CREATE_FAILED = "META_LINK_CREATE_FAILED";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetObjectLinkUtility`

*class*

Builds the URL of an object in the shape its controller serves.

```ts
export declare class StaticAssetObjectLinkUtility {
    /** The mount path may be declared with or without a leading slash; a link must carry exactly one. */
    static normalizeBasePath(opts: {
        basePath: string;
    }): string;
    /** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
    private static encodeObjectPath;
    /** The URL of one object, in the shape its controller serves: a raw path with `rawObjectPath`, a percent-encoded one without. */
    static build(opts: IObjectLocation & {
        basePath: string;
        rawObjectPath?: boolean;
    }): string;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/object-link.utility.ts`

## `StaticAssetPinnedFile`

*class*

The pending file as `validation.handler` sees it. Every read asks the storage for exactly the
content that was pinned, so a handler cannot parse bytes that are not the ones `commit` will copy:
a read that finds other content or no object throws `UPLOAD_CHANGED`.

```ts
export declare class StaticAssetPinnedFile {
    readonly key: string;
    readonly size: number;
    private readonly helper;
    private readonly location;
    private readonly pin;
    constructor(opts: {
        helper: IStorageHelper;
        location: IObjectLocation;
        pin: IStaticAssetPin;
        size: number;
    });
    /** What a read or a copy requires of the object: the exact version when the pin has one, else the ETag. */
    static conditionOf(opts: {
        pin: IStaticAssetPin;
    }): {
        ifMatch?: string;
        versionId?: string;
    };
    /** The pin of what the storage holds now. An object with no ETag cannot be pinned. */
    static pinOf(opts: {
        stat: IFileStat;
        scope: string;
    }): IStaticAssetPin;
    stream(opts?: {
        range?: {
            start: number;
            end?: number;
        };
    }): Promise<ReadableStream<Uint8Array>>;
}
```

Source: `packages/core-server/src/components/static-asset/utilities/pinned-file.utility.ts`

## `StaticAssetRouteKeys`

*class*

The built-in routes of a generated controller, the keys of `routes`.

```ts
export declare class StaticAssetRouteKeys {
    static readonly UPLOAD = "upload";
    static readonly LIST_OBJECTS = "listObjects";
    static readonly DELETE_OBJECT = "deleteObject";
    static readonly GET_OBJECT_BY_NAME = "getObjectByName";
    static readonly DOWNLOAD_OBJECT_BY_NAME = "downloadObjectByName";
    static readonly UPLOAD_POLICY = "uploadPolicy";
    static readonly UPLOAD_COMMIT = "uploadCommit";
    static readonly UPLOAD_VALIDATE = "uploadValidate";
    static readonly RECREATE_META_LINK = "recreateMetaLink";
    /** Every key, in registration order. */
    static readonly ALL: readonly ["getObjectByName", "downloadObjectByName", "upload", "deleteObject", "listObjects", "uploadPolicy", "uploadCommit", "uploadValidate", "recreateMetaLink"];
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetToggleUtility`

*class*

Reads the `{ use }` switches an entry is written with.

```ts
export declare class StaticAssetToggleUtility {
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

Source: `packages/core-server/src/components/static-asset/utilities/toggle.utility.ts`

## `StaticAssetTokenStages`

*class*

Where a commit token is in its life: issued with the policy, then validated against the content it pins.

```ts
export declare class StaticAssetTokenStages {
    static readonly ISSUED = "issued";
    static readonly VALIDATED = "validated";
}
```

Source: `packages/core-server/src/components/static-asset/common/constants.ts`

## `StaticAssetUploadCommitService`

*class*

Moves a pending upload to its final key and records it: the body of the `upload-commit` route,
callable without a request. A service that saves its own record commits the upload in the same
call instead of asking the client for a second request.

The token proves the key was issued by a policy, to one owner, with the metadata the application
chose for the file. A commit is single-use: it refuses a destination that already holds an object.

```ts
export declare class StaticAssetUploadCommitService<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> extends BaseService {
    private readonly options;
    private readonly keyPrefix;
    private readonly pendingPrefix;
    private readonly policyKeyPrefix;
    constructor(opts: IStaticAssetUploadCommitServiceOptions<Schema>);
    /** The signature, the expiry, the owner, the bucket and the pending scope: the checks every stage of a token starts with. */
    private readPayload;
    /**
     * Everything `commit` checks before it touches storage, and nothing else: the signature, the
     * expiry, the owner, the bucket and the pending scope. Returns the PENDING object with the token's
     * owner and metadata, with no storage call and no side effect, so an application can read an
     * uploaded file and report its problems to the user before anything is committed.
     *
     * A token this refuses is refused the same way `commit` refuses it, and every refusal says no more
     * than that the token is no good: a caller learns nothing about which keys exist.
     */
    verify(opts: {
        token: string;
        owner: string;
    }): Promise<IObjectLocation & {
        owner: string;
        metadata: TStaticAssetTokenMetadata;
    }>;
    /**
     * `verify`, then the application's own check of the pending file, read once through a file pinned
     * to the content that is there now. A valid file answers the token `commit` takes: it is bound to
     * that content and dies when the incoming token does. An invalid one answers its issues and no token.
     * A token of either stage may be validated again, which pins whatever is there at that moment.
     */
    validate(opts: {
        token: string;
        owner: string;
    }): Promise<IStaticAssetValidateResult<unknown>>;
    private runValidation;
    /**
     * Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the
     * row. With a `validation` on it takes the token `validate` returned and never runs the handler; the
     * copy then happens only if the content still matches the pin. The final key is the default one
     * unless `resolvers.commit.destination` names another; either way it must be free, so a token
     * commits once. A MetaLink failure rides the result as a code: the object IS committed by then.
     */
    commit(opts: {
        token: string;
        /** Who is committing: a token commits only for the owner it was issued to. */
        owner: string;
        labels?: TStaticAssetUploadLabels;
        /** The final key for this call. It wins over `resolvers.commit.destination` and passes the same checks. */
        destination?: IObjectRef;
    }): Promise<IStaticAssetCommitResult>;
    /** The default key is the pending one without the pending prefix; the application's resolver may name another, inside the scope. */
    private resolveDestination;
    /** The caller's `destination`, else the resolver's, else none: the default key. */
    private pickDestination;
    /** The token's only commit: a second one, or a re-post to the pending key, must not overwrite what the first one stored. */
    private assertDestinationFree;
    /** A pin makes the copy conditional; a failed condition is a changed upload, and nothing is written. */
    private copyPinned;
}
```

Source: `packages/core-server/src/components/static-asset/services/commitment.service.ts`

## `StaticAssetUploadPolicyService`

*class*

Signs the permission for a browser to post bytes straight to storage: the body of the
`upload-policy` route, callable without a request.

Authorization is NOT here. A policy is a write credential, and who may ask for one is the route's
`directUpload.authorize`; code that calls this service has decided that for itself.

```ts
export declare class StaticAssetUploadPolicyService extends BaseService {
    private readonly options;
    private readonly policyKeyPrefix;
    private readonly commitLifetimeMs?;
    constructor(opts: IStaticAssetUploadPolicyServiceOptions);
    /** `undefined` when `expires.commit` is not set: the token then dies with the policy. */
    private static resolveCommitLifetimeMs;
    /**
     * One signed policy per file. A size over `maxBytes`, a name that is not one valid key segment and
     * `metadata` over the cap are refused before any policy is signed. `files[].metadata` is what the
     * token signs: the caller has already decided it (the route runs `resolvers.metadata`).
     */
    issuePolicies(opts: {
        files: TStaticAssetUploadPolicyRequest['files'];
        owner: string;
    }): Promise<TStaticAssetUploadPolicy[]>;
}
```

Source: `packages/core-server/src/components/static-asset/services/policy.service.ts`

## `StaticAssetValidation`

*class*

Defines the application's check of an uploaded file; see `directUpload.validation`.

```ts
export declare class StaticAssetValidation {
    /** Returns `opts` switched on. It exists to infer `IssueSchema`, so a handler that answers another shape of issue fails type-checking. */
    static define<IssueSchema extends z.ZodType>(opts: IStaticAssetValidation<IssueSchema>): IStaticAssetValidation<IssueSchema> & {
        use: true;
    };
}
```

Source: `packages/core-server/src/components/static-asset/common/validation.ts`

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
    repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
    createMetaLink?: (opts: {
        uploadResult: IUploadResult;
        fileStat: IFileStat;
        /** The caller's labels: form fields on an upload, beside the commit token on a direct one. */
        labels: TStaticAssetUploadLabels;
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

## `TToggle`

*type*

A feature that is on or off. `{ use: false }` is the whole off state; `{ use: true, ... }` carries
the options. One shape for every switch, so an option is never read from a feature that is off.

```ts
export type TToggle<Options extends object = Record<never, never>> = {
    use: false;
} | ({
    use: true;
} & Options);
```

Source: `packages/core-server/src/components/static-asset/common/types.ts`
