import { BaseRestController } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import type { IObjectRef, IStorageHelper } from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TStaticAssetEntry } from '../common';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import { StaticAssetEntryUtility } from '../utilities/entry.utility';
import { StaticAssetServe } from './routes/serve';
import { StaticAssetRouteTable } from './routes/table';

/** Input of `StaticAssetControllerFactory.build`: one entry of `TStaticAssetComponentOptions` and its key. */
export interface IStaticAssetControllerOptions<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> {
  /** The entry's key in the options object: the controller's name is derived from it. */
  key: string;
  entry: TStaticAssetEntry<Schema>;

  /** What the direct upload routes run: the instances the component bound, so an application service resolving them from the container and the routes share them. Required when the entry turns `directUpload` on. */
  policyService?: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
  commitService?: Pick<StaticAssetUploadCommitService<Schema>, 'commit' | 'validate'>;
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
    return StaticAssetServe.resolveServedContentType(opts);
  }

  static build<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema>(
    opts: IStaticAssetControllerOptions<Schema>,
  ) {
    const { policyService, commitService } = opts;
    const { directUpload, ...resolved } = StaticAssetEntryUtility.resolve({
      key: opts.key,
      entry: opts.entry,
    });
    const { name, basePath, helper, extend } = resolved;

    if (directUpload && (!policyService || !commitService)) {
      throw getError({
        message: `[${name}] directUpload needs policyService and commitService | the component builds and binds them; a caller of StaticAssetControllerFactory.build passes its own`,
      });
    }

    const env = {
      ...resolved,
      directUpload: directUpload &&
        policyService &&
        commitService && { ...directUpload, policyService, commitService },
    };

    @controllerDecorator({ path: basePath })
    class GeneratedStaticAssetController extends BaseRestController {
      constructor() {
        super({ scope: name, path: basePath });
      }

      override binding(): ValueOrPromise<void> {
        // First, so a literal path can win over the built-in catch-all `rawObjectPath` registers.
        extend?.before?.({ controller: this, helper, basePath });

        StaticAssetRouteTable.register({
          controller: this,
          env: { ...env, logger: this.logger },
        });

        // Last, so a built-in route always wins a path collision with an application's own.
        extend?.after?.({ controller: this, helper, basePath });
      }
    }

    Object.defineProperty(GeneratedStaticAssetController, 'name', {
      value: name,
      configurable: true,
    });

    return GeneratedStaticAssetController;
  }
}
