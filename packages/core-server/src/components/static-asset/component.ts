import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { Binding } from '@venizia/ignis-kernel';
import { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { StaticAssetComponentBindingKeys, TStaticAssetsComponentOptions } from './common';
import { AssetControllerFactory, buildObjectLink } from './controller';

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
      const {
        storage,
        controller,
        helper,
        extra,
        resolveObjectName,
        defineRoutesBefore,
        defineExtraRoutes,
      } = opt;

      this.application.controller(
        AssetControllerFactory.defineAssetController({
          controller,
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
              (linkOptions =>
                buildObjectLink({
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
}
