import type { z } from '@hono/zod-openapi';
import {
  StorageUtility,
  type IBucketRef,
  type IObjectLocation,
  type IObjectRef,
  type IStorageHelper,
  type IUploadResult,
} from '@venizia/ignis-helpers';
import {
  ResolverUtility,
  type TValueOrAsyncResolver,
  type ValueOrPromise,
} from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BaseService } from '@venizia/ignis-kernel';
import {
  StaticAssetDefaults,
  StaticAssetErrors,
  StaticAssetMetaLinkCodes,
  StaticAssetTokenStages,
} from '../common';
import { StaticAssetCommitTokenUtility } from '../utilities';
import type {
  IStaticAssetValidation,
  IStaticAssetCommitTokenPayload,
  IStaticAssetPin,
  IStaticAssetValidateResult,
  IStaticAssetValidationResult,
  TStaticAssetDirectUploadOptions,
  TMetaLinkConfig,
  TStaticAssetStorageType,
  TStaticAssetTokenMetadata,
  TStaticAssetUploadLabels,
} from '../common';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../utilities/meta-link.utility';
import { StaticAssetPinnedFile } from '../utilities/pinned-file.utility';
import type { TMetaLinkCompatibleSchema, TMetaLinkSchema } from '../models';

/** What a commit answers. `metaLink` is absent when the entry keeps no MetaLink table. */
export interface IStaticAssetCommitResult {
  bucket: IBucketRef;
  object: IObjectRef;
  owner: string;
  metadata: TStaticAssetTokenMetadata;
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
  /** The bucket the entry resolves; a token naming another is refused. */
  bucket: TValueOrAsyncResolver<string>;
  /** The entry's `keyPrefix` as configured; normalized here the way the controller does. */
  keyPrefix: string;
  /** Folders a final key may nest, the scope's own included. */
  objectKeyMaxDepth: number;
  directUpload: Pick<
    TStaticAssetDirectUploadOptions,
    'secretKey' | 'pendingPrefix' | 'resolvers'
  > & {
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
 * The token proves the key was issued by a policy, to one owner, with the metadata the application
 * chose for the file. A commit is single-use: it refuses a destination that already holds an object.
 */
export class StaticAssetUploadCommitService<
  Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema,
> extends BaseService {
  private readonly options: IStaticAssetUploadCommitServiceOptions<Schema>;
  private readonly keyPrefix: string;
  private readonly pendingPrefix: string;
  private readonly policyKeyPrefix: string;

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
    this.policyKeyPrefix = prefixes.policyKeyPrefix;
  }

  /** The signature, the expiry, the owner, the bucket and the pending scope: the checks every stage of a token starts with. */
  private async readPayload(opts: {
    token: string;
    owner: string;
  }): Promise<IStaticAssetCommitTokenPayload> {
    const payload = StaticAssetCommitTokenUtility.read({
      token: opts.token,
      secretKey: this.options.directUpload.secretKey,
    });
    const bucketName = await ResolverUtility.resolveValueAsync({ value: this.options.bucket });

    // One error for every refusal: a caller learns only that the token is no good for them. A token
    // another entry signed with the same secret must not land here, in its bucket or outside its scope.
    if (
      payload.owner !== opts.owner ||
      payload.bucket.name !== bucketName ||
      !payload.object.key.startsWith(this.policyKeyPrefix)
    ) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    return payload;
  }

  /**
   * Everything `commit` checks before it touches storage, and nothing else: the signature, the
   * expiry, the owner, the bucket and the pending scope. Returns the PENDING object with the token's
   * owner and metadata, with no storage call and no side effect, so an application can read an
   * uploaded file and report its problems to the user before anything is committed.
   *
   * A token this refuses is refused the same way `commit` refuses it, and every refusal says no more
   * than that the token is no good: a caller learns nothing about which keys exist.
   */
  async verify(opts: {
    token: string;
    owner: string;
  }): Promise<IObjectLocation & { owner: string; metadata: TStaticAssetTokenMetadata }> {
    const { bucket, object, owner, metadata } = await this.readPayload(opts);

    return { bucket, object, owner, metadata };
  }

  /**
   * `verify`, then the application's own check of the pending file, read once through a file pinned
   * to the content that is there now. A valid file answers the token `commit` takes: it is bound to
   * that content and dies when the incoming token does. An invalid one answers its issues and no token.
   * A token of either stage may be validated again, which pins whatever is there at that moment.
   */
  async validate(opts: {
    token: string;
    owner: string;
  }): Promise<IStaticAssetValidateResult<unknown>> {
    const { helper, directUpload, scope } = this.options;
    const payload = await this.readPayload(opts);
    const location = { bucket: payload.bucket, object: payload.object };

    const stat = await helper.getStat(location);
    const pin = StaticAssetPinnedFile.pinOf({ stat, scope });
    const result = await this.runValidation({ location, pin, size: stat.size, payload });

    if (!result.isValid) {
      return { isValid: false, issues: result.issues };
    }

    return {
      ...result,
      commitToken: StaticAssetCommitTokenUtility.build({
        payload: { ...payload, stage: StaticAssetTokenStages.VALIDATED, pin },
        secretKey: directUpload.secretKey,
      }),
    };
  }

  private runValidation(opts: {
    location: IObjectLocation;
    pin: IStaticAssetPin;
    size: number;
    payload: IStaticAssetCommitTokenPayload;
  }): ValueOrPromise<IStaticAssetValidationResult<unknown>> {
    const { helper, directUpload } = this.options;

    if (!directUpload.validation) {
      return { isValid: true, issues: [] };
    }

    const { location, pin, size, payload } = opts;

    return directUpload.validation.handler({
      file: new StaticAssetPinnedFile({ helper, location, pin, size }),
      owner: payload.owner,
      metadata: payload.metadata,
    });
  }

  /**
   * Moves the pending object to its final key and, when the entry keeps a MetaLink table, writes the
   * row. With a `validation` on it takes the token `validate` returned and never runs the handler; the
   * copy then happens only if the content still matches the pin. The final key is the default one
   * unless `resolvers.commit.destination` names another; either way it must be free, so a token
   * commits once. A MetaLink failure rides the result as a code: the object IS committed by then.
   */
  async commit(opts: {
    token: string;
    /** Who is committing: a token commits only for the owner it was issued to. */
    owner: string;
    labels?: TStaticAssetUploadLabels;
  }): Promise<IStaticAssetCommitResult> {
    const { helper, storage, metaLink, directUpload, link: buildLink } = this.options;

    // Verified BEFORE any storage call. That is what keeps this from being a name prober: a forged
    // token fails without a round trip, so timing says nothing.
    const payload = await this.readPayload(opts);
    const { bucket: bucketRef, object: pendingObject, owner, metadata, pin } = payload;

    if (directUpload.validation && payload.stage !== StaticAssetTokenStages.VALIDATED) {
      throw getError(StaticAssetErrors.UPLOAD_NOT_VALIDATED);
    }

    // Labels, not authorization - the token deliberately carries no business fields, so they travel
    // beside it rather than inside it.
    const labels = opts.labels ?? {};

    const object = await this.resolveDestination({ payload });

    await this.assertDestinationFree({ bucket: bucketRef, object });
    await this.copyPinned({ bucket: bucketRef, source: pendingObject, destination: object, pin });

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
        const stat = await helper.getStat({ bucket: bucketRef, object });
        const fileStat = {
          ...stat,
          metadata: { ...stat.metadata, [StaticAssetDefaults.META_LINK_METADATA_KEY]: metadata },
        };
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
      owner,
      metadata,
      link,
      metaLink: metaLinkResult,
    };
  }

  /** The default key is the pending one without the pending prefix; the application's resolver may name another, inside the scope. */
  private async resolveDestination(opts: {
    payload: IStaticAssetCommitTokenPayload;
  }): Promise<IObjectRef> {
    const { helper, directUpload, scope, objectKeyMaxDepth } = this.options;
    const { object, owner, metadata } = opts.payload;
    const defaultKey = object.key.slice(this.pendingPrefix.length);
    const destination = directUpload.resolvers.commit?.destination;

    if (!destination) {
      return { key: defaultKey };
    }

    const resolved = await destination({
      owner,
      metadata,
      file: { fileName: defaultKey.slice(defaultKey.lastIndexOf('/') + 1) },
      defaultKey,
    });

    if (!resolved.key.startsWith(this.keyPrefix)) {
      throw getError({
        error: StaticAssetErrors.OBJECT_KEY_OUT_OF_SCOPE,
        message: `[${scope}] destination is outside the key prefix of this entry | keyPrefix: ${this.keyPrefix}`,
      });
    }

    if (!helper.isValidObjectKey({ object: resolved, maxDepth: objectKeyMaxDepth })) {
      throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
    }

    return { key: resolved.key };
  }

  /** The token's only commit: a second one, or a re-post to the pending key, must not overwrite what the first one stored. */
  private async assertDestinationFree(opts: {
    bucket: IBucketRef;
    object: IObjectRef;
  }): Promise<void> {
    try {
      await this.options.helper.getStat(opts);
    } catch (error) {
      if (StorageUtility.isNotFoundError({ error })) {
        return;
      }

      throw error;
    }

    throw getError(StaticAssetErrors.UPLOAD_ALREADY_COMMITTED);
  }

  /** A pin makes the copy conditional; a failed condition is a changed upload, and nothing is written. */
  private async copyPinned(opts: {
    bucket: IBucketRef;
    source: IObjectRef;
    destination: IObjectRef;
    pin?: IStaticAssetPin;
  }): Promise<void> {
    const { bucket, source, destination, pin } = opts;
    const condition = pin ? StaticAssetPinnedFile.conditionOf({ pin }) : {};

    try {
      await this.options.helper.copyObject({
        bucket,
        source,
        destination,
        ifMatch: condition.ifMatch,
        sourceVersionId: condition.versionId,
      });
    } catch (error) {
      // With a pin the object was there when it was validated: a miss now is a change as much as other content is.
      if (
        pin &&
        (StorageUtility.isPreconditionFailedError({ error }) ||
          StorageUtility.isNotFoundError({ error }))
      ) {
        throw getError({ error: StaticAssetErrors.UPLOAD_CHANGED, cause: error });
      }

      throw error;
    }
  }
}
