import type { z } from '@hono/zod-openapi';
import type {
  IBucketRef,
  IObjectLocation,
  IObjectRef,
  IStorageHelper,
  IUploadResult,
} from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { BaseService } from '@venizia/ignis-kernel';
import { StaticAssetErrors, StaticAssetMetaLinkCodes } from '../common';
import { StaticAssetCommitTokenUtility } from '../utilities';
import type {
  IStaticAssetValidation,
  IStaticAssetValidationResult,
  TStaticAssetDirectUploadOptions,
  TMetaLinkConfig,
  TStaticAssetStorageType,
  TStaticAssetUploadLabels,
} from '../common';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../utilities/meta-link.utility';
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
  /** The entry's `keyPrefix` as configured; normalized here the way the controller does. */
  keyPrefix: string;
  directUpload: Pick<TStaticAssetDirectUploadOptions, 'secretKey' | 'pendingPrefix'> & {
    /** Absent, every file is valid. */
    validation?: IStaticAssetValidation<z.ZodType>;
  };
  storage: TStaticAssetStorageType;
  metaLink?: TMetaLinkConfig<Schema>;
  /** The link a commit returns for the committed object: the entry's own, so a commit and an upload agree. */
  link: (opts: IObjectLocation) => string;
}

/**
 * Moves a pending upload to its final key and records it: the body of the `upload-commit` route,
 * callable without a request. A service that saves its own record commits the upload in the same
 * call instead of asking the client for a second request.
 *
 * The token proves the key was issued by a policy. It names an owner only when
 * `directUpload.resolveOwner` is set, and then only that owner may commit it; without one, anyone who
 * holds the token can.
 */
export class StaticAssetUploadCommitService<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> extends BaseService {
  private readonly options: IStaticAssetUploadCommitServiceOptions<Schema>;
  private readonly keyPrefix: string;
  private readonly pendingPrefix: string;

  constructor(opts: IStaticAssetUploadCommitServiceOptions<Schema>) {
    super({ scope: opts.scope });

    this.options = opts;

    const prefixes = StaticAssetKeyScopeUtility.resolveDirectUploadPrefixes({
      keyPrefix: opts.keyPrefix,
      pendingPrefix: opts.directUpload.pendingPrefix,
      helper: opts.helper,
      scope: opts.scope,
    });
    this.keyPrefix = prefixes.keyPrefix;
    this.pendingPrefix = prefixes.pendingPrefix;
  }

  /**
   * Everything `commit` checks before it touches storage, and nothing else: the signature, the
   * expiry, the owner and the `keyPrefix` scope. Returns the PENDING object, with no storage call and
   * no side effect, so an application can read an uploaded file and report its problems to the user
   * before anything is committed.
   *
   * A token this refuses is refused the same way `commit` refuses it, and every refusal says no more
   * than that the token is no good: a caller learns nothing about which keys exist.
   */
  verify(opts: { token: string; owner?: string }): IObjectLocation {
    const payload = StaticAssetCommitTokenUtility.read({
      token: opts.token,
      secretKey: this.options.directUpload.secretKey,
    });

    // The same error as a forged token: a caller learns only that the token is no good for them.
    if (payload.owner !== undefined && payload.owner !== opts.owner) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    // A token another controller signed with the same secret must not land outside this scope.
    StaticAssetKeyScopeUtility.assertInScope({
      key: payload.object.key.slice(this.pendingPrefix.length),
      keyPrefix: this.keyPrefix,
    });

    return { bucket: payload.bucket, object: payload.object };
  }

  /**
   * `verify`, then the application's own check of the pending file. With no `validation` configured
   * every file is valid. The issues are the application's, in the shape of its `issueSchema`.
   */
  async validate(opts: {
    token: string;
    owner?: string;
  }): Promise<IStaticAssetValidationResult<unknown>> {
    const pending = this.verify({ token: opts.token, owner: opts.owner });

    return this.runValidation({ pending, owner: opts.owner });
  }

  private async runValidation(opts: {
    pending: IObjectLocation;
    owner?: string;
  }): Promise<IStaticAssetValidationResult<unknown>> {
    const { helper, directUpload } = this.options;

    if (!directUpload.validation) {
      return { isValid: true, issues: [] };
    }

    return directUpload.validation.handler({ ...opts.pending, owner: opts.owner, helper });
  }

  /** Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the row. A MetaLink failure rides the result as a code: the object IS committed by then. */
  async commit(opts: {
    token: string;
    /** Who is committing. A token issued to an owner commits only for that owner. */
    owner?: string;
    labels?: TStaticAssetUploadLabels;
  }): Promise<IStaticAssetCommitResult> {
    const { helper, storage, metaLink, link: buildLink } = this.options;

    // Verified BEFORE any storage call. That is what keeps this from being a name prober: a forged
    // token fails without a round trip, so timing says nothing.
    const pending = this.verify({ token: opts.token, owner: opts.owner });
    const { bucket: bucketRef, object: pendingObject } = pending;

    // An invalid file never leaves the pending prefix: this runs before the copy.
    const validation = await this.runValidation({ pending, owner: opts.owner });

    if (!validation.isValid) {
      throw getError(StaticAssetErrors.UPLOAD_INVALID);
    }

    // Labels, not authorization - the token deliberately carries no business fields, so they travel
    // beside it rather than inside it.
    const labels = opts.labels ?? {};

    const object = { key: pendingObject.key.slice(this.pendingPrefix.length) };

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

    const link = buildLink({ bucket: bucketRef, object });

    // The two paths have to agree: without this a client reading `metaLink` off the
    // response renders an empty state with no error - the failure nobody reports.
    let metaLinkResult: IUploadResult['metaLink'];

    if (metaLink) {
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
          labels,
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
      metaLink: metaLinkResult,
    };
  }
}
