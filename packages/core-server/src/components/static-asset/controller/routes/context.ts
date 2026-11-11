import type { BaseRestController, TRouteContext, TRouteHandler } from '@/base/controllers';
import type { IAuthRouteConfig } from '@/base';
import type {
  IBucketRef,
  IObjectLocation,
  IObjectRef,
  IStorageHelper,
} from '@venizia/ignis-helpers';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { AnyType, TConstValue, TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  StaticAssetErrors,
  type TMetaLinkConfig,
  type TStaticAssetDirectUploadOptions,
  type TStaticAssetExtraOptions,
  type TStaticAssetObjectNameResolver,
  type TStaticAssetObjectParams,
  type TStaticAssetRouteConfig,
  type TStaticAssetRouteKey,
  type TStaticAssetStorageType,
} from '../../common';
import type {
  StaticAssetUploadCommitService,
  StaticAssetUploadPolicyService,
} from '../../services';
import { StaticAssetKeyScopeUtility } from '../../utilities/key-scope.utility';

/** The part of an entry a route belongs to: a route is registered only when its feature is on. */
export class StaticAssetFeatures {
  static readonly BUCKET = 'bucket';
  static readonly OBJECT = 'object';
  static readonly SERVER_UPLOAD = 'serverUpload';
  static readonly DIRECT_UPLOAD = 'directUpload';
  static readonly VALIDATION = 'validation';
  static readonly META_LINK = 'metaLink';
}

export type TStaticAssetFeature = TConstValue<typeof StaticAssetFeatures>;

/** What the direct upload routes run, present only when the entry configured `directUpload`. */
export interface IStaticAssetDirectEnv {
  options: TStaticAssetDirectUploadOptions;
  policyService: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
  commitService: Pick<StaticAssetUploadCommitService, 'commit' | 'validate'>;
}

/** What every route reads: the entry, resolved once. */
export interface IStaticAssetRouteEnv {
  logger: BaseRestController['logger'];
  helper: IStorageHelper;
  storage: TStaticAssetStorageType;

  /** Absent: the bucket is in the URL. */
  bucket?: TValueOrAsyncResolver<string>;
  keyPrefix?: string;
  /** Folders allowed in an object key: the caller's `maxFolderDepth` plus the scope's own. */
  objectKeyMaxDepth: number;
  /** The caller's folders only. */
  maxFolderDepth: number;
  maxBytes?: number;
  maxFiles: number;
  rawObjectPath: boolean;
  options?: TStaticAssetExtraOptions;
  resolveObjectName?: TStaticAssetObjectNameResolver;

  /** Handed to the helper's upload; absent leaves the helper's own link untouched. */
  normalizeLinkFn?: (opts: IObjectLocation) => string;
  /** The link of an existing object. */
  link: (opts: IObjectLocation) => string;

  /** The table is erased at this seam on purpose: inside the routes every read and write is on MetaLink COLUMNS. */
  metaLink?: TMetaLinkConfig<AnyType>;
  direct?: IStaticAssetDirectEnv;
}

/** A route's own overrides, as `StaticAssetRouteOptionsUtility.readRoute` resolved them. */
export type TStaticAssetRouteOverride = Omit<
  TStaticAssetRouteConfig,
  'enabled' | 'authenticate' | 'authorize'
> &
  Pick<IAuthRouteConfig, 'authenticate' | 'authorize'>;

export interface IStaticAssetRoute {
  key: TStaticAssetRouteKey;
  feature: TStaticAssetFeature;

  /** The OpenAPI definition and the handler of one route, side by side. */
  build: (env: IStaticAssetRouteEnv) => {
    config: IAuthRouteConfig;
    handler: TRouteHandler<AnyType>;
  };

  /** Middleware the route adds after the application's own. */
  middleware?: (opts: {
    env: IStaticAssetRouteEnv;
    own: TStaticAssetRouteConfig['middleware'];
  }) => TStaticAssetRouteConfig['middleware'];
}

/** A route builder reaches for an option its feature guarantees; a miss is a bug in the table, never in the input. */
export const requireFeature = <T>(opts: {
  value: T | undefined;
  feature: TStaticAssetFeature;
}): T => {
  if (opts.value === undefined) {
    throw getError({
      message: `[static-asset] a ${opts.feature} route was built without its ${opts.feature} option`,
    });
  }

  return opts.value;
};

/** A configured value wins - read per request, so an application may read an environment variable lazily - else the path param, which only exists when there is no configured bucket. */
const resolveBucketName = async (opts: {
  env: IStaticAssetRouteEnv;
  param?: string;
}): Promise<string> => {
  const { env, param } = opts;

  if (env.bucket === undefined) {
    return param ?? '';
  }

  return ResolverUtility.resolveValueAsync({ value: env.bucket });
};

/**
 * The bucket, and for an object route the key, one request names - checked and scoped before any
 * storage call, so a key outside the scope is never even probed.
 */
export const resolveTarget = async (opts: {
  ctx: TRouteContext;
  env: IStaticAssetRouteEnv;
  /** An object route also names a key. */
  isObject?: boolean;
}): Promise<{ bucket: IBucketRef; object: IObjectRef }> => {
  const { ctx, env, isObject = false } = opts;

  // A configured bucket drops `bucketName` from the params, and a route with no object has none left.
  const params =
    isObject || env.bucket === undefined
      ? ctx.req.valid<Partial<TStaticAssetObjectParams>>('param')
      : {};
  const bucketName = await resolveBucketName({ env, param: params.bucketName });

  if (!env.helper.isValidBucketName({ bucket: { name: bucketName } })) {
    throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
  }

  if (!isObject) {
    return { bucket: { name: bucketName }, object: { key: '' } };
  }

  const key = params.objectName ?? '';

  if (!env.helper.isValidObjectKey({ object: { key }, maxDepth: env.objectKeyMaxDepth })) {
    throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
  }

  StaticAssetKeyScopeUtility.assertInScope({ key, keyPrefix: env.keyPrefix });

  return { bucket: { name: bucketName }, object: { key } };
};
