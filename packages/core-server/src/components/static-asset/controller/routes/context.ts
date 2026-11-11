import type { BaseRestController, TRouteContext, TRouteHandler } from '@/base/controllers';
import type { IAuthRouteConfig } from '@/base';
import type { IBucketRef, IObjectRef } from '@venizia/ignis-helpers';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { AnyType, TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  StaticAssetErrors,
  type TStaticAssetObjectParams,
  type TStaticAssetRouteKey,
} from '../../common';
import type {
  StaticAssetUploadCommitService,
  StaticAssetUploadPolicyService,
} from '../../services';
import type { IStaticAssetResolvedEntry } from '../../utilities/entry.utility';
import { StaticAssetKeyScopeUtility } from '../../utilities/key-scope.utility';
import type { TStaticAssetRouteOverride } from '../../utilities/route-options.utility';

/** The part of an entry a route belongs to: a route is registered only when its feature is on. */
export class StaticAssetFeatures {
  static readonly OBJECT = 'object';
  static readonly SERVER_UPLOAD = 'serverUpload';
  static readonly DIRECT_UPLOAD = 'directUpload';
  static readonly VALIDATION = 'validation';
  static readonly META_LINK = 'metaLink';
}

export type TStaticAssetFeature = TConstValue<typeof StaticAssetFeatures>;

/** What every route reads: the entry, resolved once, plus what only the running controller has. The table is erased at this seam on purpose: inside the routes every read and write is on MetaLink COLUMNS. */
export interface IStaticAssetRouteEnv extends Omit<
  IStaticAssetResolvedEntry<AnyType>,
  'directUpload'
> {
  logger: BaseRestController['logger'];
  /** The resolved options with the services the component bound: the instances an application resolves from the container. */
  directUpload?: NonNullable<IStaticAssetResolvedEntry<AnyType>['directUpload']> & {
    policyService: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
    commitService: Pick<StaticAssetUploadCommitService, 'commit' | 'validate'>;
  };
}

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
    own: TStaticAssetRouteOverride['middleware'];
  }) => TStaticAssetRouteOverride['middleware'];
}

export class StaticAssetRouteUtility {
  /** A route builder reaches for an option its feature guarantees; a miss is a bug in the table, never in the input. */
  static requireFeature<T>(opts: { value: T | undefined; feature: TStaticAssetFeature }): T {
    if (opts.value === undefined) {
      throw getError({
        message: `[static-asset] a ${opts.feature} route was built without its ${opts.feature} option`,
      });
    }

    return opts.value;
  }

  /**
   * The bucket, and for an object route the key, one request names - checked and scoped before any
   * storage call, so a key outside the scope is never even probed.
   */
  static async resolveTarget(opts: {
    ctx: TRouteContext;
    env: IStaticAssetRouteEnv;
    /** An object route also names a key. */
    isObject?: boolean;
  }): Promise<{ bucket: IBucketRef; object: IObjectRef }> {
    const { ctx, env, isObject = false } = opts;
    // Read per request: an application may read an environment variable lazily.
    const bucketName = await ResolverUtility.resolveValueAsync({ value: env.bucket });

    if (!env.helper.isValidBucketName({ bucket: { name: bucketName } })) {
      throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
    }

    if (!isObject) {
      return { bucket: { name: bucketName }, object: { key: '' } };
    }

    const { objectName: key } = ctx.req.valid<TStaticAssetObjectParams>('param');

    if (!env.helper.isValidObjectKey({ object: { key }, maxDepth: env.objectKeyMaxDepth })) {
      throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
    }

    StaticAssetKeyScopeUtility.assertInScope({ key, keyPrefix: env.keyPrefix });

    return { bucket: { name: bucketName }, object: { key } };
  }
}
