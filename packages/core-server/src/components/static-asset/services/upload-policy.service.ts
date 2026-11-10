import type { IPostPolicy, IStorageHelper } from '@venizia/ignis-helpers';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError, UuidHelper } from '@venizia/ignis-helpers/core';
import { BaseService } from '@venizia/ignis-kernel';
import { AssetCommitToken, StaticAssetErrors } from '../common';
import type { TDirectUploadOptions, TUploadPolicyRequest } from '../common';
import { AssetKeyScope } from '../controller/key-scope';

/** What the client posts to the storage, plus the key it lands under and the token that commits it. */
export type TAssetUploadPolicy = IPostPolicy & { objectName: string; commitToken: string };

export interface IAssetUploadPolicyServiceOptions {
  /** Names the logger; the controller's own name is the usual value. */
  scope: string;
  helper: IStorageHelper;
  /** A policy names ONE bucket, so a direct upload has no bucket in its URL. */
  bucket: TValueOrAsyncResolver<string>;
  /** The controller's `keyPrefix` as configured; normalized here the way the controller does. */
  keyPrefix?: string;
  directUpload: Pick<
    TDirectUploadOptions,
    'maxBytes' | 'expiresIn' | 'secretKey' | 'pendingPrefix'
  >;
}

/**
 * Signs the permission for a browser to post bytes straight to storage: the body of the
 * `upload-policy` route, callable without a request.
 *
 * Authorization is NOT here. A policy is a write credential, and who may ask for one is the route's
 * `directUpload.authorize`; code that calls this service has decided that for itself.
 */
export class AssetUploadPolicyService extends BaseService {
  private readonly options: IAssetUploadPolicyServiceOptions;
  private readonly policyKeyPrefix: string;

  constructor(opts: IAssetUploadPolicyServiceOptions) {
    super({ scope: opts.scope });

    this.options = opts;
    this.policyKeyPrefix = AssetKeyScope.resolveDirectUploadPrefixes({
      keyPrefix: opts.keyPrefix,
      pendingPrefix: opts.directUpload.pendingPrefix,
      helper: opts.helper,
      scope: opts.scope,
    }).policyKeyPrefix;
  }

  /** One signed policy per file. A size over `maxBytes` is refused before any policy is signed. */
  async issuePolicies(opts: {
    files: TUploadPolicyRequest['files'];
  }): Promise<TAssetUploadPolicy[]> {
    const { helper, bucket, directUpload } = this.options;
    const bucketName = await ResolverUtility.resolveValueAsync({ value: bucket });

    const policies: TAssetUploadPolicy[] = [];

    for (const file of opts.files) {
      if (file.size !== undefined && file.size > directUpload.maxBytes) {
        throw getError({
          error: StaticAssetErrors.UPLOAD_TOO_LARGE,
          message: `File '${file.fileName}' is ${file.size} bytes, over the ${directUpload.maxBytes} the policy allows`,
        });
      }

      // Generated, never taken from the caller: a key the caller picks is a key the caller
      // can collide with, and the pending object is the one thing a policy authorizes.
      const objectName = `${this.policyKeyPrefix}${UuidHelper.getInstance().v4()}/${file.fileName}`;
      const policy = await helper.presignPost({
        bucket: { name: bucketName },
        keyPrefix: this.policyKeyPrefix,
        maxBytes: directUpload.maxBytes,
        contentType: file.contentType,
        expiresIn: directUpload.expiresIn,
      });

      policies.push({
        ...policy,
        objectName,
        commitToken: AssetCommitToken.build({
          payload: {
            bucket: bucketName,
            key: objectName,
            expiresAt: new Date(policy.expiresAt).getTime(),
          },
          secretKey: directUpload.secretKey,
        }),
      });
    }

    return policies;
  }
}
