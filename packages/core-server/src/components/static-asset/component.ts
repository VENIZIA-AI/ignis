import { type BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { Binding } from '@venizia/ignis-kernel';
import { type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { StaticAssetBindingKeys, type TStaticAssetComponentOptions } from './common';
import { StaticAssetEntryUtility } from './utilities/entry.utility';
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

    for (const [key, entry] of Object.entries(componentOptions)) {
      const services = this.bindDirectUploadServices({ key, entry });

      this.application.controller(
        StaticAssetControllerFactory.build<Schema>({ key, entry, ...services }),
      );

      this.application.logger.info(
        `[binding] Asset storage is bound | Key: %s | Mount: %s | Direct upload: %s | MetaLink: %s`,
        key,
        entry.basePath,
        Boolean(entry.directUpload),
        Boolean(entry.metaLink),
      );
    }
  }

  /** One pair of services per entry that turns direct upload on. The routes run the very objects an application's service resolves from the keys. */
  private bindDirectUploadServices(opts: {
    key: string;
    entry: TStaticAssetComponentOptions<Schema>[string];
  }):
    | {
        policyService: StaticAssetUploadPolicyService;
        commitService: StaticAssetUploadCommitService<Schema>;
      }
    | undefined {
    const { key } = opts;
    const resolved = StaticAssetEntryUtility.resolve({ key, entry: opts.entry });
    const { bucket, directUpload } = resolved;

    if (!directUpload || bucket === undefined) {
      return undefined;
    }

    const policyService = new StaticAssetUploadPolicyService({
      scope: resolved.name,
      helper: resolved.helper,
      bucket,
      keyPrefix: resolved.keyPrefix,
      directUpload,
    });
    const commitService = new StaticAssetUploadCommitService<Schema>({
      scope: resolved.name,
      helper: resolved.helper,
      keyPrefix: resolved.keyPrefix,
      directUpload,
      storage: resolved.storage,
      metaLink: resolved.metaLink,
      link: resolved.link,
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
