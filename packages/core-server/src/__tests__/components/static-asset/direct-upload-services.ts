import type {
  TMetaLinkConfig,
  TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import {
  AssetUploadCommitService,
  AssetUploadPolicyService,
} from '@/components/static-asset/services';
import type { IStorageHelper } from '@venizia/ignis-helpers';

/** What the component does for an entry: builds the pair the controller runs. A test that calls `defineAssetController` directly passes the result in. */
export const buildDirectUploadServices = (opts: {
  helper: IStorageHelper;
  controller: TStaticAssetsComponentOptions[string]['controller'];
  metaLink?: TMetaLinkConfig;
}) => {
  const { helper, controller, metaLink } = opts;
  const { bucket, directUpload } = controller;

  if (!directUpload || bucket === undefined) {
    return {};
  }

  return {
    policyService: new AssetUploadPolicyService({
      scope: controller.name,
      helper,
      bucket,
      keyPrefix: controller.keyPrefix,
      directUpload,
    }),
    commitService: new AssetUploadCommitService({
      scope: controller.name,
      helper,
      keyPrefix: controller.keyPrefix,
      directUpload,
      storage: 'disk',
      useMetaLink: metaLink !== undefined,
      metaLink,
      basePath: controller.basePath,
      rawObjectPath: controller.rawObjectPath,
    }),
  };
};
