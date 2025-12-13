import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { BindingNamespaces, CoreBindings } from '@/common/bindings';
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

      const Controller = AssetControllerFactory.defineAssetController({
        controller,
        storage,
        helper,
        options: {
          ...extra,
          normalizeLinkFn: extra?.normalizeLinkFn
            ? extra.normalizeLinkFn
            : opts => {
                return `/${controller.basePath}/buckets/${opts.bucketName}/objects/${encodeURIComponent(
                  opts.normalizeName,
                )}`;
              },
        },
      });
      this.application.controller(Controller, {binding: {key: `AssetController_${key}`,namespace: BindingNamespaces.CONTROLLER}});

      this.application.logger.info(
        `[binding] Asset storage is bound | Key: %s | Storage type: %s`,
        key,
        storage,
      );
    }
  }

  // ------------------------------------------------------------------------------
  configureMinIOStorage(): void {}
}
