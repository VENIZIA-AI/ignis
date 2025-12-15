import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding, ValueOrPromise } from '@venizia/ignis-helpers';
import { StaticAssetComponentBindingKeys, TStaticAssetsComponentOptions } from './common';
import { AssetControllerFactory } from './controller';

export class StaticAssetComponent extends BaseComponent {
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
    const componentOptions = this.application.get<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    });

    for (const [key, opt] of Object.entries(componentOptions)) {
      const { storage, controller, helper, extra } = opt;

      this.application.controller(
        AssetControllerFactory.defineAssetController({
          controller,
          storage,
          helper,
          useMetaLink: opt.useMetaLink,
          metaLink: opt.useMetaLink ? opt.metaLink : undefined,
          options: {
            ...extra,
            normalizeLinkFn: extra?.normalizeLinkFn
              ? extra.normalizeLinkFn
              : opts => {
                  return `${controller.basePath}/buckets/${opts.bucketName}/objects/${encodeURIComponent(
                    opts.normalizeName,
                  )}`;
                },
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

  // ------------------------------------------------------------------------------
  configureMinIOStorage(): void {}
}
