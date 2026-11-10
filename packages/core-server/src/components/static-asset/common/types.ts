import type { z } from '@hono/zod-openapi';
import type { BaseRestController, IAuthRouteConfig, TRouteContext } from '@/base';
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
  IStorageHelper,
  IUploadResult,
  TUploadNaming,
} from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { AnyType, TValueOrAsyncResolver, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { TMultipartStorage } from '@venizia/ignis-helpers';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { IAssetProxyOptions } from '../proxy/proxy';
import type {
  AssetPresignService,
  IAssetPresignRequest,
  IAssetPresignResult,
} from '../service/presign';
import type { ICommitTokenPayload } from './commit-token';
import type { StaticAssetStorageTypes } from './constants';

/** Per-controller upload tuning: multipart parsing, name and link normalization, folder depth and size ceiling. */
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
/** Path parameters of the bucket routes. */
export type TBucketParams = { bucketName: string };
/** Path parameters of the object routes. */
export type TObjectParams = { bucketName: string; objectName: string };
/** Labels recorded on the MetaLink row of an uploaded object. */
export type TUploadQuery = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  /** Display order within the principal. Caller-supplied: deriving it would be a non-atomic read of `max(sequence)` then a write of `max + 1`. */
  sequence?: number;
  folderPath?: string;
};
/** Query of the list objects route. Every value arrives as a string. */
export type TListQuery = { prefix?: string; recursive?: string; maxKeys?: string };

/** Body of the presign route when the application configures none: the files the client intends to upload. */
export type TPresignRequestBody = {
  files: Array<{ fileName: string; contentType?: string; size: number }>;
};

/** What the presign route needs of a presign service: the one method it calls. */
export type TAssetPresigner<TPayload extends object, TContext> = Pick<
  AssetPresignService<TPayload, TContext>,
  'presign'
>;

/**
 * Enables the presigned-PUT upload flow: the client asks this route for one signed URL per file, then PUTs the bytes straight to the
 * storage. The object is written to its FINAL key with a pending tag, and the application keeps it by settling it
 * (`AssetSettleService`) once the record that owns it is saved; an object never settled is left to the storage's lifecycle rule.
 *
 * The route is a thin layer over `AssetPresignService`: authorize, map the request into files and a context, presign, map the answer.
 * Everything else (extensions, size, count, key, token, signed headers, URL rewrite, errors) is configured on the presign service.
 *
 * `TCaller` is what `authorize` answers: the caller, as the application knows it (principal, roles, tenants). `TContext` is what the
 * presign service is given (the folder's tenant, what the upload is for); it is the caller itself unless `request.toInput` builds another.
 * `TBody` is the request body.
 */
export type TDirectUploadOptions<
  TCaller extends object = object,
  TPayload extends object = ICommitTokenPayload,
  TBody = TPresignRequestBody,
  TContext = TCaller,
> = {
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
    map: (opts: { results: IAssetPresignResult[]; context: TCaller }) => unknown;
  };
};

/** The MetaLink table belongs to the application. `Schema` defaults to the table IGNIS ships, and widens to any table whose row carries the same fields. */
export type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  model: TValueOrAsyncResolver<typeof BaseRelationalEntity<Schema>>;
  repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    /** The caller's labels. Named for where they used to travel - they arrive in the request BODY now, as form fields on an upload. */
    query: TUploadQuery;
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

  uploadPresign?: TStaticAssetRouteConfig;

  recreateMetaLink?: TStaticAssetRouteConfig;
};

/** Static asset controllers keyed by an application-chosen name. Each entry pairs a storage type with its matching helper, and `useMetaLink: true` requires a `metaLink` config. */
export type TStaticAssetsComponentOptions<
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
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
  ) &
    (
      | { useMetaLink?: false | undefined }
      | { useMetaLink: true; metaLink: TMetaLinkConfig<Schema> }
    );
};
