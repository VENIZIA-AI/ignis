import { type BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { Binding } from '@venizia/ignis-kernel';
import { type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { StaticAssetBindingKeys, type TStaticAssetComponentOptions } from './common';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from './models';
import { StaticAssetControllerFactory } from './controller';
import { StaticAssetEntryUtility, type IStaticAssetResolvedEntry } from './utilities/entry.utility';

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

    for (const [key, entry] of Object.entries(componentOptions)) {
      const resolved = StaticAssetEntryUtility.resolve({ key, entry });
      const services = this.bindDirectUploadServices({ key, resolved });

      this.application.controller(
        StaticAssetControllerFactory.buildResolved<Schema>({ resolved, ...services }),
      );

      this.application.logger.info(
        `[binding] Asset storage is bound | Key: %s | Mount: %s | Storage type: %s | Direct upload: %s | MetaLink: %s`,
        key,
        resolved.basePath,
        resolved.storage,
        resolved.directUpload !== undefined,
        resolved.metaLink !== undefined,
      );
    }
  }

  /** One pair of services per entry that turns direct upload on. The routes run the very objects an application's service resolves from the keys. */
  private bindDirectUploadServices(opts: {
    key: string;
    resolved: IStaticAssetResolvedEntry<Schema>;
  }) {
    const { key, resolved } = opts;
    const services = StaticAssetEntryUtility.buildDirectUploadServices({ resolved });

    if (!services) {
      return undefined;
    }

    this.application
      .bind({ key: StaticAssetBindingKeys.policyService({ name: key }) })
      .toValue(services.policyService);
    this.application
      .bind({ key: StaticAssetBindingKeys.commitService({ name: key }) })
      .toValue(services.commitService);

    return services;
  }
}
