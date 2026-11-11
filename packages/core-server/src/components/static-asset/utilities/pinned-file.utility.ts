import {
  StorageUtility,
  type IFileStat,
  type IObjectLocation,
  type IStorageHelper,
} from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetErrors, type IStaticAssetPin } from '../common';

/**
 * The pending file as `validation.handler` sees it. Every read asks the storage for exactly the
 * content that was pinned, so a handler cannot parse bytes that are not the ones `commit` will copy:
 * a read that finds other content or no object throws `UPLOAD_CHANGED`.
 */
export class StaticAssetPinnedFile {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  /** Derived from the key, never from what the uploader declared. */
  readonly contentType: string;

  private readonly helper: IStorageHelper;
  private readonly location: IObjectLocation;
  private readonly pin: IStaticAssetPin;

  constructor(opts: {
    helper: IStorageHelper;
    location: IObjectLocation;
    pin: IStaticAssetPin;
    size: number;
  }) {
    this.helper = opts.helper;
    this.location = opts.location;
    this.pin = opts.pin;
    this.key = opts.location.object.key;
    this.size = opts.size;
    this.etag = opts.pin.etag;
    this.contentType = opts.helper.getMimeType({ filename: opts.location.object.key });
  }

  /** What a read or a copy requires of the object: the exact version when the pin has one, else the ETag. */
  static conditionOf(opts: { pin: IStaticAssetPin }): { ifMatch?: string; versionId?: string } {
    const { pin } = opts;

    return pin.versionId === undefined ? { ifMatch: pin.etag } : { versionId: pin.versionId };
  }

  /** The pin of what the storage holds now. An object with no ETag cannot be pinned. */
  static pinOf(opts: { stat: IFileStat; scope: string }): IStaticAssetPin {
    const { stat, scope } = opts;

    if (!stat.etag) {
      throw getError({
        message: `[${scope}] The storage reported no ETag for the pending object | a pinned validation needs one`,
      });
    }

    return {
      etag: stat.etag,
      versionId: StorageUtility.realVersionId({ value: stat.versionId }),
    };
  }

  async stream(opts?: {
    range?: { start: number; end?: number };
  }): Promise<ReadableStream<Uint8Array>> {
    try {
      const stream = await this.helper.getObjectStream({
        ...this.location,
        range: opts?.range,
        ...StaticAssetPinnedFile.conditionOf({ pin: this.pin }),
      });

      return stream;
    } catch (error) {
      if (
        StorageUtility.isPreconditionFailedError({ error }) ||
        StorageUtility.isNotFoundError({ error })
      ) {
        throw getError({ error: StaticAssetErrors.UPLOAD_CHANGED, cause: error });
      }

      throw error;
    }
  }
}
