import type {
  IBucketRef,
  IObjectRef,
  IPostPolicy,
  IStorageHelper,
  IUploadResult,
} from '@venizia/ignis-helpers';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { AnyType, TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError, UuidHelper } from '@venizia/ignis-helpers/core';
import { BaseService } from '@venizia/ignis-kernel';
import {
  AssetCommitToken,
  DEFAULT_PENDING_PREFIX,
  META_LINK_CREATE_FAILED,
  StaticAssetErrors,
} from '../common';
import type {
  TDirectUploadOptions,
  TMetaLinkConfig,
  TStaticAssetStorageType,
  TUploadPolicyRequest,
  TUploadQuery,
} from '../common';
import { AssetKeyScope } from '../controller/key-scope';
import { AssetMetaLink } from '../controller/meta-link';
import { AssetObjectLink } from '../controller/object-link';

/** What the client posts to the storage, plus the key it lands under and the token that commits it. */
export type TAssetUploadPolicy = IPostPolicy & { objectName: string; commitToken: string };

/** What a commit answers. `metaLink` is absent when the entry keeps no MetaLink table. */
export interface IAssetCommitResult {
  bucket: IBucketRef;
  object: IObjectRef;
  link: string;
  metaLink?: IUploadResult['metaLink'];
}

/** What an `AssetDirectUploadService` needs, all of it one options entry already carries. */
export interface IAssetDirectUploadServiceOptions {
  /** Names the logger; the controller's own name is the usual value. */
  scope: string;
  helper: IStorageHelper;
  /** A policy names ONE bucket, so a direct upload has no bucket in its URL. */
  bucket: TValueOrAsyncResolver<string>;
  /** The controller's `keyPrefix` as configured; this class normalizes it the way the controller does. */
  keyPrefix?: string;
  directUpload: TDirectUploadOptions;
  storage: TStaticAssetStorageType;
  useMetaLink?: boolean;
  /** The table is erased here for the reason it is at the controller seam: this class only reads and writes MetaLink columns. */
  metaLink?: TMetaLinkConfig<AnyType>;
  /** The controller mount path, the base of the link a commit returns. */
  basePath: string;
  rawObjectPath?: boolean;
}

/**
 * The signed-policy upload flow, callable without a request: the controller's two routes and an
 * application service run the same code. A service that saves its own record commits the upload in
 * the same call instead of asking the client for a second request.
 *
 * Authorization is NOT here. `issuePolicies` hands out a write credential, and who may ask for one is
 * the route's `directUpload.authorize`; a caller that reaches this class directly has decided that
 * for itself.
 */
export class AssetDirectUploadService extends BaseService {
  private readonly options: IAssetDirectUploadServiceOptions;
  private readonly pendingPrefix: string;
  private readonly policyKeyPrefix: string;
  private readonly basePath: string;
  private readonly keyPrefix?: string;

  constructor(opts: IAssetDirectUploadServiceOptions) {
    super({ scope: opts.scope });

    this.options = opts;
    this.basePath = AssetObjectLink.normalizeBasePath({ basePath: opts.basePath });
    this.keyPrefix =
      opts.keyPrefix === undefined
        ? undefined
        : AssetKeyScope.normalizePrefix({
            keyPrefix: opts.keyPrefix,
            helper: opts.helper,
            scope: opts.scope,
          }).keyPrefix;
    this.pendingPrefix = opts.directUpload.pendingPrefix ?? DEFAULT_PENDING_PREFIX;
    // The scope rides inside the pending key, so the commit, which strips `pendingPrefix`, lands inside it.
    this.policyKeyPrefix = `${this.pendingPrefix}${this.keyPrefix ?? ''}`;
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

  /** Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the row. A MetaLink failure rides the result as a code: the object IS committed by then. */
  async commit(opts: { commitToken: string; labels?: TUploadQuery }): Promise<IAssetCommitResult> {
    const { helper, directUpload, storage, useMetaLink, metaLink } = this.options;

    // Verified BEFORE any storage call. That is what keeps this from being a name prober: a forged
    // token fails without a round trip, so timing says nothing.
    const payload = AssetCommitToken.read({
      token: opts.commitToken,
      secretKey: directUpload.secretKey,
    });

    // Labels, not authorization - the token deliberately carries no business fields, so they travel
    // beside it rather than inside it.
    const query = opts.labels ?? {};

    const bucketRef = { name: payload.bucket };
    const pendingObject = { key: payload.key };
    const object = { key: payload.key.slice(this.pendingPrefix.length) };

    // A token another controller signed with the same secret must not land outside this scope.
    AssetKeyScope.assertInScope({ key: object.key, keyPrefix: this.keyPrefix });

    // Before the copy, so a hook that throws leaves the object under the pending prefix
    // for a lifecycle rule, rather than stranding it at the final key.
    await directUpload.onCommit?.({ bucket: bucketRef, pendingObject, object });

    await helper.copyObject({
      bucket: bucketRef,
      source: pendingObject,
      destination: object,
    });

    // The copy IS the commit; removing the temporary object is cleanup. A failure here
    // leaves one object for the lifecycle rule, and failing the request would tell the
    // caller their upload did not work when it did.
    try {
      await helper.removeObject({ bucket: bucketRef, object: pendingObject });
    } catch (error) {
      this.logger
        .for('UPLOAD_COMMIT')
        .warn(
          'Committed, but the pending object remains | key: %s | error: %s',
          pendingObject.key,
          error,
        );
    }

    const link = AssetObjectLink.build({
      basePath: this.basePath,
      bucket: bucketRef,
      object,
      hasConfiguredBucket: true,
      rawObjectPath: this.options.rawObjectPath,
    });

    // The two paths have to agree: without this a client reading `metaLink` off the
    // response renders an empty state with no error - the failure nobody reports.
    let metaLinkResult: IUploadResult['metaLink'];

    if (useMetaLink && metaLink) {
      try {
        const fileStat = await helper.getStat({ bucket: bucketRef, object });
        const data = await AssetMetaLink.createRow({
          metaLink,
          helper,
          storage,
          uploadResult: AssetMetaLink.buildStoredUploadResult({
            helper,
            bucket: bucketRef,
            object,
            link,
            fileStat,
          }),
          fileStat,
          query,
        });

        metaLinkResult = { data };
      } catch (error) {
        // The object IS committed by now. A 500 would send the caller back with a token
        // whose source no longer exists, so this rides the body as a code, like UPLOAD.
        this.logger
          .for('UPLOAD_COMMIT')
          .error('Failed to create MetaLink | objectName: %s | Error: %s', object.key, error);
        metaLinkResult = { error: META_LINK_CREATE_FAILED };
      }
    }

    return {
      bucket: bucketRef,
      object,
      link,
      ...(metaLinkResult === undefined ? {} : { metaLink: metaLinkResult }),
    };
  }
}
