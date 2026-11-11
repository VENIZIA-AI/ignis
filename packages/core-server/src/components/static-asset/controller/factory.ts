import { BaseRestController } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import {
  BaseStorageHelper,
  type IObjectLocation,
  type IObjectRef,
  type IStorageHelper,
} from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  type TStaticAssetDefineExtraRoutes,
  type TMetaLinkConfig,
  type TStaticAssetObjectNameResolver,
  type TStaticAssetAuth,
  type TStaticAssetExtraOptions,
  type TStaticAssetComponentOptions,
  type TStaticAssetStorageType,
} from '../common';
import { StaticAssetDefaults } from '../common';
import type { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';
import { StaticAssetObjectLinkUtility } from '../utilities/object-link.utility';
import type { IStaticAssetRouteEnv } from './routes/context';
import { resolveServedContentType } from './routes/serve';
import { registerRoutes } from './routes/table';

/** Input of `StaticAssetControllerFactory.build`: one entry of `TStaticAssetComponentOptions` with its storage type and helper. */
export interface IStaticAssetControllerOptions {
  controller: TStaticAssetComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  /** The table is erased at this seam on purpose. The public option types carry the real `Schema` and check it; inside the controller every read and write is on MetaLink COLUMNS, and threading a table type nobody here constrains through 700 lines of handler buys nothing. */
  metaLink?: TMetaLinkConfig<AnyType>;
  options?: TStaticAssetExtraOptions;

  /** Authentication and authorization of every built-in route; see `TStaticAssetAuth`. */
  auth?: TStaticAssetAuth;

  /** What the two direct upload routes run: the instances the component bound, so an application service resolving them from the container and the routes share them. Required when `controller.directUpload` is set. */
  policyService?: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
  commitService?: Pick<StaticAssetUploadCommitService, 'commit' | 'validate'>;

  /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
  resolveObjectName?: TStaticAssetObjectNameResolver;

  /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
  defineRoutesBefore?: TStaticAssetDefineExtraRoutes;

  /** Registers the application's own routes on the generated controller, after every built-in one. */
  defineExtraRoutes?: TStaticAssetDefineExtraRoutes;
}

/** Builds the REST controller class for a static asset entry, and decides the served content type. */
export class StaticAssetControllerFactory {
  /**
   * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
   * the API origin is stored XSS. Public so a hand-written route makes the same decision - the
   * backend's own content-type is dropped by `StaticAssetHeaders.ALLOWED`.
   */
  static resolveServedContentType(opts: { helper: IStorageHelper; object: IObjectRef }): {
    contentType: string;
    isRenderable: boolean;
  } {
    return resolveServedContentType(opts);
  }

  static build(opts: IStaticAssetControllerOptions) {
    const { controller, helper, options, useMetaLink, metaLink, storage } = opts;
    const { resolveObjectName, defineRoutesBefore, defineExtraRoutes, auth } = opts;
    const { directUpload } = controller;
    const { name, basePath, routes, isStrict = true, bucket, rawObjectPath = false } = controller;
    const maxFolderDepth = options?.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    const hasConfiguredBucket = bucket !== undefined;

    // With the bucket in the URL, the bucket routes stay unscoped and the scope spans every bucket.
    if (controller.keyPrefix !== undefined && !hasConfiguredBucket) {
      throw getError({
        message: `[${name}] keyPrefix needs controller.bucket | a bucket in the URL is a bucket the caller chooses, and the bucket routes cannot be scoped`,
      });
    }

    const scope =
      controller.keyPrefix === undefined
        ? undefined
        : StaticAssetKeyScopeUtility.normalizePrefix({
            keyPrefix: controller.keyPrefix,
            helper,
            scope: name,
          });

    let direct: IStaticAssetRouteEnv['direct'];

    if (directUpload) {
      if (!hasConfiguredBucket) {
        throw getError({
          message: `[${name}] directUpload needs controller.bucket | a policy names one bucket, and a bucket in the URL is a bucket the caller chooses`,
        });
      }

      const { policyService, commitService } = opts;

      if (!policyService || !commitService) {
        throw getError({
          message: `[${name}] directUpload needs policyService and commitService | the component builds and binds them; a caller of StaticAssetControllerFactory.build passes its own`,
        });
      }

      direct = { options: directUpload, policyService, commitService };
    }

    // The mount path may be declared with or without a leading slash; a link must carry exactly one.
    const normalizedBasePath = StaticAssetObjectLinkUtility.normalizeBasePath({ basePath });
    const buildLink = (linkOptions: IObjectLocation) =>
      StaticAssetObjectLinkUtility.build({
        basePath: normalizedBasePath,
        bucket: linkOptions.bucket,
        object: linkOptions.object,
        hasConfiguredBucket,
        rawObjectPath,
      });

    @controllerDecorator({ path: basePath })
    class GeneratedStaticAssetController extends BaseRestController {
      constructor() {
        super({ scope: name, path: basePath, isStrict });
      }

      override binding(): ValueOrPromise<void> {
        // First, so a literal path can win over the built-in catch-all `rawObjectPath` registers.
        defineRoutesBefore?.({ controller: this, helper, basePath: normalizedBasePath });

        registerRoutes({
          controller: this,
          routes,
          auth,
          env: {
            logger: this.logger,
            helper,
            storage,
            bucket,
            keyPrefix: scope?.keyPrefix,
            // `maxFolderDepth` counts the caller's folders; the scope's own are configuration, not input.
            objectKeyMaxDepth: maxFolderDepth + (scope?.depth ?? 0),
            maxFolderDepth,
            maxBytes: options?.maxBytes,
            maxFiles: options?.parseMultipartBody?.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
            rawObjectPath,
            options,
            resolveObjectName,
            // Only when the URL shape deviates: with neither option the storage helper's own link is left untouched.
            normalizeLinkFn:
              options?.normalizeLinkFn ??
              (hasConfiguredBucket || rawObjectPath ? buildLink : undefined),
            link: options?.normalizeLinkFn ?? buildLink,
            metaLink: useMetaLink ? metaLink : undefined,
            direct,
          },
        });

        // Last, so a built-in route always wins a path collision with an application's own.
        defineExtraRoutes?.({ controller: this, helper, basePath: normalizedBasePath });
      }
    }

    Object.defineProperty(GeneratedStaticAssetController, 'name', {
      value: name,
      configurable: true,
    });

    return GeneratedStaticAssetController;
  }
}
