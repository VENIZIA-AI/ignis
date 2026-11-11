import { type BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { Binding } from '@venizia/ignis-kernel';
import { type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { StaticAssetBindingKeys, type TStaticAssetComponentOptions } from './common';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from './models';
import { StaticAssetControllerFactory } from './controller';
import { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from './services';

/** `Schema` is the MetaLink table the application binds. It has to live on the CLASS, not only on the options: `component(Ctor, { options })` infers the options from the class, so a class pinned to the shipped table can only carry options for that table. */
export class StaticAssetComponent<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> extends BaseComponent<TStaticAssetComponentOptions<Schema>> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: StaticAssetComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [StaticAssetBindingKeys.STATIC_ASSET_OPTIONS]: Binding.bind<TStaticAssetComponentOptions>({
          key: StaticAssetBindingKeys.STATIC_ASSET_OPTIONS,
        }).toValue({}),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Direct options win. The key is the path for an application that registers this component
    // through `configs.artifacts`, where an index carries classes and no options.
    const componentOptions =
      this.options ??
      this.application.get<TStaticAssetComponentOptions<Schema>>({
        key: StaticAssetBindingKeys.STATIC_ASSET_OPTIONS,
      });

    const componentOptionsEntries = Object.entries(componentOptions);

    for (const [key, opt] of componentOptionsEntries) {
      const {
        storage,
        controller,
        helper,
        extra,
        resolveObjectName,
        defineRoutesBefore,
        defineExtraRoutes,
      } = opt;

      const directUploadServices = this.bindDirectUploadServices({ key, entry: opt });

      this.application.controller(
        StaticAssetControllerFactory.build({
          controller,
          ...directUploadServices,
          storage,
          helper,
          auth: opt.auth,
          useMetaLink: opt.useMetaLink,
          metaLink: opt.useMetaLink ? opt.metaLink : undefined,
          resolveObjectName,
          defineRoutesBefore,
          defineExtraRoutes,
          options: {
            ...extra,
            normalizeLinkFn:
              extra?.normalizeLinkFn ??
              // The link follows the URL shape the controller serves: `{objectName}` is one Hono path segment unless `rawObjectPath` widens it, and a configured bucket leaves the path.
              ((linkOptions) =>
                StaticAssetControllerFactory.buildObjectLink({
                  basePath: controller.basePath,
                  bucket: linkOptions.bucket,
                  object: linkOptions.object,
                  hasConfiguredBucket: controller.bucket !== undefined,
                  rawObjectPath: controller.rawObjectPath,
                })),
          },
        }),
      );

      this.application.logger.info(
        `[binding] Asset storage is bound | Key: %s | Storage type: %s | UseMetaLink: %s`,
        key,
        storage,
        Boolean(opt.useMetaLink),
      );
    }
  }

  /** One pair of services per entry that turns direct upload on. The routes run the very objects an application's service resolves from the keys. An entry without a bucket binds nothing: the controller refuses it, with the reason. */
  private bindDirectUploadServices(opts: {
    key: string;
    entry: TStaticAssetComponentOptions<Schema>[string];
  }):
    | {
        policyService: StaticAssetUploadPolicyService;
        commitService: StaticAssetUploadCommitService<Schema>;
      }
    | undefined {
    const { key, entry } = opts;
    const { controller, helper, storage } = entry;
    const { bucket, directUpload } = controller;

    if (!directUpload || bucket === undefined) {
      return undefined;
    }

    const policyService = new StaticAssetUploadPolicyService({
      scope: controller.name,
      helper,
      bucket,
      keyPrefix: controller.keyPrefix,
      directUpload,
    });
    const commitService = new StaticAssetUploadCommitService<Schema>({
      scope: controller.name,
      helper,
      keyPrefix: controller.keyPrefix,
      directUpload,
      storage,
      useMetaLink: entry.useMetaLink,
      metaLink: entry.useMetaLink ? entry.metaLink : undefined,
      basePath: controller.basePath,
      rawObjectPath: controller.rawObjectPath,
    });

    this.application
      .bind({ key: StaticAssetBindingKeys.policyService({ name: key }) })
      .toValue(policyService);
    this.application
      .bind({ key: StaticAssetBindingKeys.commitService({ name: key }) })
      .toValue(commitService);

    return { policyService, commitService };
  }
}
