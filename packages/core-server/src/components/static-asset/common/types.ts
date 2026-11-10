import type { BaseRestController, IAuthRouteConfig, TRouteContext } from '@/base';
import type { IDuration } from '@venizia/ignis-helpers/common';
import type {
  BaseRelationalEntity,
  DefaultCRUDRepository,
  TTableObject,
} from '@venizia/ignis-connectors/postgres';
import type {
  DiskHelper,
  IBucketRef,
  IFileStat,
  IObjectLocation,
  IObjectRef,
  IStorageHelper,
  IUploadResult,
  TUploadNaming,
} from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { AnyType, TValueOrAsyncResolver, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { TMultipartStorage } from '@venizia/ignis-helpers';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { StaticAssetStorageTypes } from './constants';

/** Per-controller upload tuning: multipart parsing, name and link normalization, folder depth and size ceiling. */
export type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: TMultipartStorage;
    uploadDir?: string;
    /**
     * The most file parts one upload request may carry; more is refused with 413 before anything is written. The upload-policy request is bounded by the same number (more is a 422).
     *
     * @default StaticAssetDefaults.MAX_UPLOAD_FILES (20)
     */
    maxFiles?: number;
  };

  /** `folderPath` carries the upload query's target folder - dropping it flattens nested uploads. */
  normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
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

/** Decides the key one uploaded file is stored under. `defaultKey` is what IGNIS would have written. */
export type TStaticAssetObjectNameResolver = (opts: {
  bucket: IBucketRef;
  file: TUploadNaming;
  defaultKey: string;
}) => string;

/** Adds routes of the application's own to a generated asset controller. Runs after every built-in route, so a built-in route always wins a path collision. `basePath` is the mount path with exactly one leading slash. */
/** Adds routes of the application's own. Registration order decides a path collision, so the same shape serves both the before and the after hook. */
export type TStaticAssetDefineExtraRoutes = (opts: {
  controller: BaseRestController;
  helper: IStorageHelper;
  basePath: string;
}) => void;

// Declared by hand rather than inferred: RouteHandler inference here is heavy.
/** Path parameters of the bucket routes. */
export type TStaticAssetBucketParams = { bucketName: string };
/** Path parameters of the object routes. */
export type TStaticAssetObjectParams = { bucketName: string; objectName: string };
/** Labels recorded on the MetaLink row of an uploaded object. */
export type TStaticAssetUploadQuery = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  /** Display order within the principal. Caller-supplied: deriving it would be a non-atomic read of `max(sequence)` then a write of `max + 1`. */
  sequence?: number;
  folderPath?: string;
};
/** Query of the list objects route. Every value arrives as a string. */
export type TStaticAssetListQuery = { prefix?: string; recursive?: string; maxKeys?: string };

/** Enables the signed-policy upload flow, where the client posts bytes straight to the storage and IGNIS only signs the permission and verifies the commit. */
export type TStaticAssetDirectUploadOptions = {
  /** Who may ask for a policy. REQUIRED, not defaulted: this route hands out a write credential, and there is no safe default for that. */
  authorize: (opts: { context: TRouteContext }) => ValueOrPromise<boolean>;

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

/** Body of the upload policy route: the files the client intends to upload. */
export type TStaticAssetUploadPolicyRequest = {
  files: Array<{ fileName: string; contentType?: string; size?: number }>;
};

/** The MetaLink table belongs to the application. `Schema` defaults to the table IGNIS ships, and widens to any table whose row carries the same fields. */
export type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  model: TValueOrAsyncResolver<typeof BaseRelationalEntity<Schema>>;
  repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    /** The caller's labels. Named for where they used to travel - they arrive in the request BODY now, as form fields on an upload and beside the commit token on a direct one. */
    query: TStaticAssetUploadQuery;
  }) => ValueOrPromise<{ count: number; data: TTableObject<Schema> }>;
};

/** The part of a built-in route an application may change. */
export type TStaticAssetRouteConfig = Partial<
  Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>
> & {
  /**
   * Whether this route is registered.
   *
   * @default true
   */
  enabled?: boolean;
};

/** Per-route overrides for the built-in routes of a generated asset controller. A key left out keeps that route as built. */
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

/** Static asset controllers keyed by an application-chosen name. Each entry pairs a storage type with its matching helper, and `useMetaLink: true` requires a `metaLink` config. */
export type TStaticAssetComponentOptions<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> = {
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
      directUpload?: TStaticAssetDirectUploadOptions;
    };
    extra?: TStaticAssetExtraOptions;

    /** Decides the stored object name of each uploaded file; absent keeps the storage helper's own naming. */
    resolveObjectName?: TStaticAssetObjectNameResolver;

    /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. Hono matches in registration order. */
    defineRoutesBefore?: TStaticAssetDefineExtraRoutes;

    /** Registers the application's own routes on the generated controller, after every built-in one. */
    defineExtraRoutes?: TStaticAssetDefineExtraRoutes;
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
  ) &
    (
      | { useMetaLink?: false | undefined }
      | { useMetaLink: true; metaLink: TMetaLinkConfig<Schema> }
    );
};

/** What a commit token binds. Business fields are deliberately absent - which order or tenant an upload belongs to is the application's, and a token the framework signs is the wrong place to put its authorization. */
export interface IStaticAssetCommitTokenPayload {
  bucket: string;
  key: string;
  expiresAt: number;
}
