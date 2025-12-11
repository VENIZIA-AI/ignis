import { BaseApplication } from "@/base/applications";
import { BaseComponent } from "@/base/components";
import { inject } from "@/base/metadata";
import { CoreBindings } from "@/common/bindings";
import { Binding, ValueOrPromise } from "@venizia/ignis-helpers";
import { StaticAssetComponentBindingKeys, TStaticAssetsComponentOptions } from "./common";
import { MinioAssetController, StaticResourceController } from "./controller";

const DEFAULT_OPTIONS: TStaticAssetsComponentOptions = {
  minioAsset: { enable: false },
  staticResource: { enable: false },
};

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
          }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const { minioAsset, staticResource: staticAsset } =
      this.application.get<TStaticAssetsComponentOptions>({
        key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
        isOptional: true,
      }) ?? DEFAULT_OPTIONS;

    if (minioAsset?.enable) {
      const { minioHelper } = minioAsset;
      this.application
        .bind({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        })
        .toValue(minioHelper);
      this.application
        .bind({
          key: StaticAssetComponentBindingKeys.MINIO_ASSET_OPTIONS,
        })
        .toValue(minioAsset.options);

      this.application.controller(MinioAssetController);
    }

    if (staticAsset?.enable) {
      const { resourceBasePath } = staticAsset;
      this.application
        .bind({
          key: StaticAssetComponentBindingKeys.RESOURCE_BASE_PATH,
        })
        .toValue(resourceBasePath);
      this.application
        .bind({ key: StaticAssetComponentBindingKeys.STATIC_RESOURCE_OPTIONS })
        .toValue(staticAsset.options);

      this.application.controller(StaticResourceController);
    }
  }
}
