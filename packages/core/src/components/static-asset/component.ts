import { inject } from "@/base/metadata";
import { BaseComponent } from "@/base/components";
import { CoreBindings } from "@/common/bindings";
import { Binding, ValueOrPromise } from "@venizia/ignis-helpers";
import { BaseApplication } from "@/base/applications";
import { TStaticAssetsOptions, StaticAssetBindingKeys } from "./common";
import { MinioAssetController } from "./controller";

const DEFAULT_OPTIONS: TStaticAssetsOptions = {
  minioAsset: { enable: false },
  staticAsset: { enable: false },
};

export class StaticAssetComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: StaticAssetComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [StaticAssetBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS]: Binding.bind<TStaticAssetsOptions>({
          key: StaticAssetBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const { minioAsset, staticAsset } =
      this.application.get<TStaticAssetsOptions>({
        key: StaticAssetBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
        isOptional: true,
      }) ?? DEFAULT_OPTIONS;

    if (minioAsset?.enable) {
      const { minioHelper } = minioAsset;
      this.application
        .bind({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        })
        .toValue(minioHelper);
      this.application.bind({
        key: StaticAssetBindingKeys.MINIO_ASSET_OPTIONS
      }).toValue(minioAsset.options);

      this.application.controller(MinioAssetController);
    }

    if (staticAsset?.enable) {
      const { resourceBasePath } = staticAsset;
      this.application
        .bind({
          key: StaticAssetBindingKeys.RESOURCE_BASE_PATH,
        })
        .toValue(resourceBasePath);
    }
  }
}
