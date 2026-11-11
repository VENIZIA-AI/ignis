import type { BaseRestController, IAuthRouteConfig, TRouteAuthConfig, TRouteContext } from '@/base';
import type { z } from '@hono/zod-openapi';
import type { IDuration } from '@venizia/ignis-helpers/common';
import type { DefaultCRUDRepository, TTableObject } from '@venizia/ignis-connectors/postgres';
import type {
  DiskHelper,
  IBucketRef,
  IFileStat,
  IObjectLocation,
  IObjectRef,
  IStorageHelper,
  IUploadResult,
  StorageTypes,
  TUploadNaming,
} from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type {
  TConstValue,
  TValueOrAsyncResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers/common';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { StaticAssetRouteKeys } from './constants';

/**
 * A feature that is on or off. `{ use: false }` is the whole off state; `{ use: true, ... }` carries
 * the options. One shape for every switch, so an option is never read from a feature that is off.
 */
export type TToggle<Options extends object = Record<never, never>> =
  | { use: false }
  | ({ use: true } & Options);

/** The storage backends a static asset entry can serve from: the helpers that declare one. */
export type TStaticAssetStorageType = typeof StorageTypes.DISK | typeof StorageTypes.BUN_S3;

/** Decides the key one uploaded file is stored under. `defaultKey` is what IGNIS would have written - the scope and the default naming - so the hook may keep it, extend it or ignore it. */
export type TStaticAssetObjectKeyResolver = (opts: {
  bucket: IBucketRef;
  file: TUploadNaming;
  defaultKey: string;
}) => string;

/** Adds routes of the application's own. Registration order decides a path collision, so the same shape serves both the before and the after hook. */
export type TStaticAssetDefineExtraRoutes = (opts: {
  controller: BaseRestController;
  helper: IStorageHelper;
  basePath: string;
}) => void;

/** Path parameters of the object routes. */
export type TStaticAssetObjectParams = { objectName: string };

/** Labels recorded on the MetaLink row of an uploaded object. */
export type TStaticAssetUploadLabels = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  /** Display order within the principal. Caller-supplied: deriving it would be a non-atomic read of `max(sequence)` then a write of `max + 1`. */
  sequence?: number;
};

/** Enables the signed-policy upload flow, where the client posts bytes straight to the storage and IGNIS only signs the permission and verifies the commit. */
export type TStaticAssetDirectUploadOptions = {
  /**
   * Who may use direct upload. Guards every direct-upload route. There is no safe default for a
   * route that hands out a write credential, so leaving it out is allowed only when the entry's
   * `auth` already authenticates or authorizes: then `auth` is the gate. With neither, the
   * component refuses to start.
   */
  authorize?: (opts: { context: TRouteContext }) => ValueOrPromise<boolean>;

  /**
   * Who the upload belongs to. Called on every direct-upload route: the policy route signs the
   * answer into the commit token, and the other routes refuse a token whose owner differs. Absent,
   * a token commits for whoever holds it.
   */
  resolveOwner?: (opts: { context: TRouteContext }) => ValueOrPromise<string>;

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
   * Checks the pending file. On, the component registers `POST {base}/upload-validate`, and
   * `commit` runs the same check first and refuses an invalid file with `UPLOAD_INVALID`.
   * Build it with `StaticAssetValidation.define`.
   */
  validation: TToggle<IStaticAssetValidation<z.ZodType>>;
};

/** What a validation answers: whether the file may be committed, and the problems the user should see. */
export interface IStaticAssetValidationResult<Issue> {
  isValid: boolean;
  issues: Issue[];
}

/**
 * The application's own check of an uploaded file, run on the PENDING object before anything is
 * committed. The component owns the route and the refusal; the application owns only this logic.
 * Build it with `StaticAssetValidation.define` so the handler is typed by `issueSchema`.
 */
export interface IStaticAssetValidation<IssueSchema extends z.ZodType> {
  /** The shape of ONE issue. It types the handler's answer and documents the route's response. */
  issueSchema: IssueSchema;
  handler: (
    opts: IObjectLocation & { owner?: string; helper: IStorageHelper },
  ) => ValueOrPromise<IStaticAssetValidationResult<z.infer<IssueSchema>>>;
}

/** Body of the upload policy route: the files the client intends to upload. */
export type TStaticAssetUploadPolicyRequest = {
  files: Array<{ fileName: string; contentType?: string; size?: number }>;
};

/** The MetaLink table belongs to the application. `Schema` defaults to the table IGNIS ships, and widens to any table whose row carries the same fields. */
export type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    /** The caller's labels: form fields on an upload, beside the commit token on a direct one. */
    labels: TStaticAssetUploadLabels;
  }) => ValueOrPromise<{ count: number; data: TTableObject<Schema> }>;
};

/** The part of a built-in route an application may change. `authenticate` and `authorize` replace the entry's `auth` for this route, and `{ skip: true }` leaves it open. */
export type TStaticAssetRouteConfig = Partial<
  Omit<IAuthRouteConfig, 'method' | 'request' | 'responses' | 'authenticate' | 'authorize'>
> &
  TRouteAuthConfig;

/** Authentication and authorization for every built-in route of an entry; a route's own `authenticate`/`authorize` replaces it for that route. */
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

/** The name of a built-in route, the key of `routes`. */
export type TStaticAssetRouteKey = TConstValue<typeof StaticAssetRouteKeys>;

/**
 * What each built-in route does: `{ use: false }` turns it off, `{ use: true, ... }` turns it on
 * with those overrides. A route left out is on as built.
 */
export type TStaticAssetRoutes = Partial<
  Record<TStaticAssetRouteKey, TToggle<TStaticAssetRouteConfig>>
>;

/** Uploading through the application: the browser sends the bytes to `POST /objects` and the application writes them to the storage. */
export type TStaticAssetServerUploadOptions = {
  /** Largest file the route accepts. Absent means no ceiling. Checked against `content-length` before the body is read, then per file after parsing. */
  maxBytes?: number;

  /**
   * The most file parts one request may carry; more is refused with 413 before anything is written.
   *
   * @default StaticAssetDefaults.MAX_UPLOAD_FILES (20)
   */
  maxFiles?: number;

  /**
   * Maximum folder nesting depth allowed in object paths, for every route of the entry.
   *
   * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
   */
  maxFolderDepth?: number;

  /** The one hook that decides the key an uploaded file is stored under. Absent keeps the default naming. Under a `keyPrefix` a key outside the scope is refused, never rewritten. */
  objectKey?: TStaticAssetObjectKeyResolver;
};

/** Direct upload is a POST policy, which only S3 can sign, and its pending objects stay out of the served scope only when the entry has a `keyPrefix`. */
type TStaticAssetDirectUploadScope =
  | { keyPrefix?: string; directUpload: { use: false } }
  | { keyPrefix: string; directUpload: { use: true } & TStaticAssetDirectUploadOptions };

/** The storage helper decides which direct upload shapes are possible. */
type TStaticAssetStorage =
  | ({ helper: BunS3Helper } & TStaticAssetDirectUploadScope)
  | { helper: DiskHelper; keyPrefix?: string; directUpload: { use: false } };

/** One storage backend with its generated controller. Every switch is a toggle; a toggle left out is a type error, so nothing is on or off by accident. */
export type TStaticAssetEntry<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  basePath: string;

  /** The controller's name. Absent, it is derived from the entry's key. */
  name?: string;

  /** The single bucket every route uses. The function form is read per request, so an environment variable can be read lazily. */
  bucket: TValueOrAsyncResolver<string>;

  /**
   * The key scope this entry owns, e.g. `inventory/`. Every route refuses a key outside it as a
   * 404 without calling the storage, `listObjects` lists only inside it, and an upload key must
   * land inside it. `serverUpload.maxFolderDepth` counts the folders below it. Required with
   * `directUpload`: it keeps the pending prefix outside everything the routes serve.
   *
   * @default every key in the bucket
   */
  keyPrefix?: string;

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

/** Static asset entries keyed by an application-chosen name; each key becomes one controller. */
export type TStaticAssetComponentOptions<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> = Record<string, TStaticAssetEntry<Schema>>;

/**
 * What a commit token binds: the pending object a policy was issued for, when the grant dies and,
 * when the application supplies one, who it was issued to. Other business fields are deliberately
 * absent - which order or tenant an upload belongs to is the application's.
 */
export interface IStaticAssetCommitTokenPayload {
  bucket: IBucketRef;
  object: IObjectRef;
  expiresAt: number;
  /** Absent when `directUpload.resolveOwner` is not set; present, the token commits only for that owner. */
  owner?: string;
}
