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
import type { MinioHelper } from '@venizia/ignis-helpers/minio';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { StaticAssetStorageTypes } from './constants';

export type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };

  /** `folderPath` carries the upload query's target folder - dropping it flattens nested uploads. */
  normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
  normalizeLinkFn?: (opts: IObjectLocation) => string;

  /** Maximum folder nesting depth allowed in object paths. Default: 2 */
  maxFolderDepth?: number;

  /** Largest file the UPLOAD route accepts, in bytes. Absent means no ceiling. Checked against `content-length` before the body is spooled, and per file after parsing - a multipart body can lie about its total. */
  maxBytes?: number;
  [key: string]: AnyType;
};

/** Decides the key one uploaded file is stored under. `defaultKey` is what IGNIS would have written. */
export type TObjectNameResolver = (opts: {
  bucket: IBucketRef;
  file: TUploadNaming;
  defaultKey: string;
}) => string;

/** Adds routes of the application's own to a generated asset controller. Runs after every built-in route, so a built-in route always wins a path collision. `basePath` is the mount path with exactly one leading slash. */
/** Adds routes of the application's own. Registration order decides a path collision, so the same shape serves both the before and the after hook. */
export type TDefineExtraRoutes = (opts: {
  controller: BaseRestController;
  helper: IStorageHelper;
  basePath: string;
}) => void;

// Declared by hand rather than inferred: RouteHandler inference here is heavy.
export type TBucketParams = { bucketName: string };
export type TObjectParams = { bucketName: string; objectName: string };
export type TUploadQuery = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  /** Display order within the principal. The caller supplies it; the component never derives one, because reading a maximum and writing max+1 is not atomic. */
  sequence?: number;
  folderPath?: string;
};
export type TListQuery = { prefix?: string; recursive?: string; maxKeys?: string };

export type TDirectUploadOptions = {
  /** Who may ask for a policy. REQUIRED, not defaulted: this route hands out a write credential, and there is no safe default for that. */
  authorize: (opts: { context: TRouteContext }) => ValueOrPromise<boolean>;

  /** Signs the commit token. Keep it out of the repository and out of the client. */
  secretKey: string;

  /** The ceiling the policy carries as `content-length-range`. A signed PUT cannot express this at all, which is why this is a POST policy. */
  maxBytes: number;

  /** Where a policy may write. The final key is NEVER in a policy, so content cannot be replaced after the commit. Default: `pending/`. */
  pendingPrefix?: string;

  /** How long a policy and its commit token stay good. Default: the helper's POST default. */
  expiresIn?: IDuration;

  /** Runs BEFORE the copy to the final key, so a hook that throws leaves the object under the pending prefix for a lifecycle rule to collect, rather than stranding it at the final key. */
  onCommit?: (opts: {
    bucket: IBucketRef;
    pendingObject: IObjectRef;
    object: IObjectRef;
  }) => ValueOrPromise<void>;
};

export type TUploadPolicyRequest = {
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
    query: TUploadQuery;
  }) => ValueOrPromise<{ count: number; data: TTableObject<Schema> }>;
};

export type TStaticAssetRoutes = {
  getBuckets?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  getBucketByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  createBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  deleteBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;

  upload?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  listObjects?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  deleteObject?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  getObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  downloadObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;

  uploadPolicy?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
  uploadCommit?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;

  recreateMetaLink?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
};

export type TStaticAssetsComponentOptions<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;

      /** `true` serves a raw nested object path (`/objects/photos/2024/f.jpg`) - a URL shape change; a percent-encoded path keeps working either way. Default: `false`. */
      rawObjectPath?: boolean;

      /** The single bucket every object route uses. It leaves the URL (`/objects/{objectName}`) and the four bucket-management routes are not registered. The function form is read per request, so an environment variable can be read lazily. */
      bucket?: TValueOrAsyncResolver<string>;

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
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  ) &
    (
      { useMetaLink?: false | undefined } | { useMetaLink: true; metaLink: TMetaLinkConfig<Schema> }
    );
};
