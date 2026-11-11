import type { IBucketRef, IObjectRef, IStorageHelper, IUploadResult } from '@venizia/ignis-helpers';
import { BaseService } from '@venizia/ignis-kernel';
import { StaticAssetMetaLinkCodes } from '../common';
import { StaticAssetCommitTokenUtility } from '../utilities';
import type {
  TStaticAssetDirectUploadOptions,
  TMetaLinkConfig,
  TStaticAssetStorageType,
  TStaticAssetUploadQuery,
} from '../common';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../utilities/meta-link.utility';
import { StaticAssetObjectLinkUtility } from '../utilities/object-link.utility';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';

/** What a commit answers. `metaLink` is absent when the entry keeps no MetaLink table. */
export interface IStaticAssetCommitResult {
  bucket: IBucketRef;
  object: IObjectRef;
  link: string;
  metaLink?: IUploadResult['metaLink'];
}

/** `Schema` is the MetaLink table the application bound, the same type parameter the component carries. */
export interface IStaticAssetUploadCommitServiceOptions<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> {
  /** Names the logger; the controller's own name is the usual value. */
  scope: string;
  helper: IStorageHelper;
  /** The controller's `keyPrefix` as configured; normalized here the way the controller does. */
  keyPrefix?: string;
  directUpload: Pick<TStaticAssetDirectUploadOptions, 'secretKey' | 'pendingPrefix' | 'onCommit'>;
  storage: TStaticAssetStorageType;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig<Schema>;
  /** The controller mount path, the base of the link a commit returns. */
  basePath: string;
  rawObjectPath?: boolean;
}

/**
 * Moves a pending upload to its final key and records it: the body of the `upload-commit` route,
 * callable without a request. A service that saves its own record commits the upload in the same
 * call instead of asking the client for a second request.
 *
 * The token proves the key was issued by a policy; it carries no owner. Whether the current caller
 * may commit that key is the application's decision, made before it calls `commit`.
 */
export class StaticAssetUploadCommitService<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> extends BaseService {
  private readonly options: IStaticAssetUploadCommitServiceOptions<Schema>;
  private readonly keyPrefix?: string;
  private readonly pendingPrefix: string;
  private readonly basePath: string;

  constructor(opts: IStaticAssetUploadCommitServiceOptions<Schema>) {
    super({ scope: opts.scope });

    this.options = opts;
    this.basePath = StaticAssetObjectLinkUtility.normalizeBasePath({ basePath: opts.basePath });

    const prefixes = StaticAssetKeyScopeUtility.resolveDirectUploadPrefixes({
      keyPrefix: opts.keyPrefix,
      pendingPrefix: opts.directUpload.pendingPrefix,
      helper: opts.helper,
      scope: opts.scope,
    });
    this.keyPrefix = prefixes.keyPrefix;
    this.pendingPrefix = prefixes.pendingPrefix;
  }

  /** Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the row. A MetaLink failure rides the result as a code: the object IS committed by then. */
  async commit(opts: {
    commitToken: string;
    labels?: TStaticAssetUploadQuery;
  }): Promise<IStaticAssetCommitResult> {
    const { helper, directUpload, storage, useMetaLink, metaLink } = this.options;

    // Verified BEFORE any storage call. That is what keeps this from being a name prober: a forged
    // token fails without a round trip, so timing says nothing.
    const payload = StaticAssetCommitTokenUtility.read({
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
    StaticAssetKeyScopeUtility.assertInScope({ key: object.key, keyPrefix: this.keyPrefix });

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

    const link = StaticAssetObjectLinkUtility.build({
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
        const data = await StaticAssetMetaLinkUtility.createRow({
          metaLink,
          helper,
          storage,
          uploadResult: StaticAssetMetaLinkUtility.buildStoredUploadResult({
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
        metaLinkResult = { error: StaticAssetMetaLinkCodes.CREATE_FAILED };
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
