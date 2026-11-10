import { type BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { Binding } from '@venizia/ignis-kernel';
import { type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { StaticAssetComponentBindingKeys, type TStaticAssetsComponentOptions } from './common';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from './models';
import { AssetControllerFactory } from './controller';
import { AssetDirectUploadService } from './services';

/** `Schema` is the MetaLink table the application binds. It has to live on the CLASS, not only on the options: `component(Ctor, { options })` infers the options from the class, so a class pinned to the shipped table can only carry options for that table. */
export class StaticAssetComponent<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> extends BaseComponent<TStaticAssetsComponentOptions<Schema>> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: StaticAssetComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS]:
          Binding.bind<TStaticAssetsComponentOptions>({
            key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
          }).toValue({}),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Direct options win. The key is the path for an application that registers this component
    // through `configs.artifacts`, where an index carries classes and no options.
    const componentOptions =
      this.options ??
      this.application.get<TStaticAssetsComponentOptions<Schema>>({
        key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
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

      const directUploadService = this.bindDirectUpload({ key, entry: opt });

      this.application.controller(
        AssetControllerFactory.defineAssetController({
          controller,
          directUploadService,
          storage,
          helper,
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
                AssetControllerFactory.buildObjectLink({
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

  /** One instance per entry that turns direct upload on. The routes run the very object an application's service resolves from the key. An entry without a bucket binds nothing: the controller refuses it, with the reason. */
  private bindDirectUpload(opts: {
    key: string;
    entry: TStaticAssetsComponentOptions<Schema>[string];
  }): AssetDirectUploadService | undefined {
    const { key, entry } = opts;
    const { controller, helper, storage } = entry;
    const { bucket, directUpload } = controller;

    if (!directUpload || bucket === undefined) {
      return undefined;
    }

    const instance = new AssetDirectUploadService({
      scope: controller.name,
      helper,
      bucket,
      keyPrefix: controller.keyPrefix,
      directUpload,
      storage,
      useMetaLink: entry.useMetaLink,
      metaLink: entry.useMetaLink ? entry.metaLink : undefined,
      basePath: controller.basePath,
      rawObjectPath: controller.rawObjectPath,
    });

    this.application
      .bind({ key: StaticAssetComponentBindingKeys.directUploadService({ name: key }) })
      .toValue(instance);

    return instance;
  }
}
