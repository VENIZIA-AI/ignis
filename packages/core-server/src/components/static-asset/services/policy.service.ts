import type { IPostPolicy, IStorageHelper } from '@venizia/ignis-helpers';
import type { IDuration } from '@venizia/ignis-helpers/common';
import { DurationMultipliers, ResolverUtility } from '@venizia/ignis-helpers/common';
import type { TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError, UuidHelper } from '@venizia/ignis-helpers/core';
import { BaseService } from '@venizia/ignis-kernel';
import { StaticAssetErrors } from '../common';
import { StaticAssetCommitTokenUtility } from '../utilities';
import type { TStaticAssetDirectUploadOptions, TStaticAssetUploadPolicyRequest } from '../common';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';

/** What the client posts to the storage, plus the key it lands under and the token that commits it. */
export type TStaticAssetUploadPolicy = IPostPolicy & { objectName: string; commitToken: string };

/** What an `StaticAssetUploadPolicyService` needs, all of it one options entry already carries. */
export interface IStaticAssetUploadPolicyServiceOptions {
  /** Names the logger; the controller's own name is the usual value. */
  scope: string;
  helper: IStorageHelper;
  /** A policy names ONE bucket, so a direct upload has no bucket in its URL. */
  bucket: TValueOrAsyncResolver<string>;
  /** The entry's `keyPrefix` as configured; normalized here the way the controller does. Required: it keeps the pending prefix out of everything the routes serve. */
  keyPrefix: string;
  directUpload: Pick<
    TStaticAssetDirectUploadOptions,
    'maxBytes' | 'expires' | 'secretKey' | 'pendingPrefix'
  >;
}

/**
 * Signs the permission for a browser to post bytes straight to storage: the body of the
 * `upload-policy` route, callable without a request.
 *
 * Authorization is NOT here. A policy is a write credential, and who may ask for one is the route's
 * `directUpload.authorize`; code that calls this service has decided that for itself.
 */
export class StaticAssetUploadPolicyService extends BaseService {
  private readonly options: IStaticAssetUploadPolicyServiceOptions;
  private readonly policyKeyPrefix: string;
  private readonly commitLifetimeMs?: number;

  constructor(opts: IStaticAssetUploadPolicyServiceOptions) {
    super({ scope: opts.scope });

    this.options = opts;
    this.commitLifetimeMs = StaticAssetUploadPolicyService.resolveCommitLifetimeMs({
      scope: opts.scope,
      commit: opts.directUpload.expires?.commit,
    });
    this.policyKeyPrefix = StaticAssetKeyScopeUtility.resolveDirectUploadPrefixes({
      keyPrefix: opts.keyPrefix,
      pendingPrefix: opts.directUpload.pendingPrefix,
      helper: opts.helper,
      scope: opts.scope,
    }).policyKeyPrefix;
  }

  /** `undefined` when `expires.commit` is not set: the token then dies with the policy. */
  private static resolveCommitLifetimeMs(opts: {
    scope: string;
    commit?: IDuration;
  }): number | undefined {
    const { scope, commit } = opts;

    if (commit === undefined) {
      return undefined;
    }

    const lifetimeMs = DurationMultipliers.toMilliseconds(commit);

    if (lifetimeMs === null || lifetimeMs <= 0) {
      throw getError({
        message: `[${scope}] directUpload.expires.commit is not a usable duration | unit: ${commit.unit} | value: ${commit.value}`,
      });
    }

    return lifetimeMs;
  }

  /** One signed policy per file. A size over `maxBytes` is refused before any policy is signed. */
  async issuePolicies(opts: {
    files: TStaticAssetUploadPolicyRequest['files'];
    owner?: string;
  }): Promise<TStaticAssetUploadPolicy[]> {
    const { helper, bucket, directUpload } = this.options;
    const bucketName = await ResolverUtility.resolveValueAsync({ value: bucket });

    const policies: TStaticAssetUploadPolicy[] = [];

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
        object: { key: objectName },
        maxBytes: directUpload.maxBytes,
        contentType: file.contentType,
        expiresIn: directUpload.expires?.upload,
      });

      policies.push({
        ...policy,
        objectName,
        commitToken: StaticAssetCommitTokenUtility.build({
          payload: {
            bucket: { name: bucketName },
            object: { key: objectName },
            expiresAt:
              this.commitLifetimeMs === undefined
                ? new Date(policy.expiresAt).getTime()
                : Date.now() + this.commitLifetimeMs,
            owner: opts.owner,
          },
          secretKey: directUpload.secretKey,
        }),
      });
    }

    return policies;
  }
}
