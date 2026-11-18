import { BindingKeys } from '@venizia/ignis-inversion';
import type { TBindingKey } from '@venizia/ignis-inversion';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';
import type { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import type { TStaticAssetComponentOptions } from './types';

/** Container keys of the static asset component. */
export class StaticAssetBindingKeys {
  /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
  static readonly STATIC_ASSET_OPTIONS = BindingKeys.build<
    TStaticAssetComponentOptions<TMetaLinkCompatibleSchema>
  >({
    key: '@app/static-asset/options',
  });

  /** The `StaticAssetUploadPolicyService` of one options entry, bound only for an entry that turns `directUpload` on. `name` is the entry's KEY in the options object, not the controller name. */
  static policyService(opts: { name: string }): TBindingKey<StaticAssetUploadPolicyService> {
    return BindingKeys.build<StaticAssetUploadPolicyService>({
      key: `@app/static-asset/policy-service/${opts.name}`,
    });
  }

  /** The `StaticAssetUploadCommitService` of one options entry, bound with its policy service. */
  static commitService<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema>(opts: {
    name: string;
  }): TBindingKey<StaticAssetUploadCommitService<Schema>> {
    return BindingKeys.build<StaticAssetUploadCommitService<Schema>>({
      key: `@app/static-asset/commit-service/${opts.name}`,
    });
  }
}
