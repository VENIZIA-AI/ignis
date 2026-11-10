import type { TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { ResolverUtility } from '@venizia/ignis-helpers/common';
import type { IStorageHelper } from '@venizia/ignis-helpers';

/** What an application decides about settling uploads. */
export interface IAssetSettleServiceOptions {
  /** The storage. It has to support `replaceObjectTags` (`BunS3Helper` does). */
  helper: IStorageHelper;

  /** The bucket the objects are in, read per call. */
  bucket: TValueOrAsyncResolver<string>;

  /**
   * The tags a settled object carries from then on, replacing the ones the upload was written with. A lifecycle rule
   * that removes objects still tagged as pending is what keeps abandoned uploads from piling up.
   */
  tags: Record<string, string>;
}

/**
 * Settles uploads written straight to their final key with a pending tag: the object is kept by replacing its tags, and
 * an object never settled is left for the storage's lifecycle rule. Nothing is copied or moved.
 *
 * For uploads that wait under a pending prefix and are copied into place, use the `directUpload` routes of the
 * component instead.
 */
export class AssetSettleService {
  private readonly options: IAssetSettleServiceOptions;

  constructor(opts: IAssetSettleServiceOptions) {
    this.options = opts;
  }

  /** Builds the service of one application. */
  static build(opts: IAssetSettleServiceOptions): AssetSettleService {
    return new AssetSettleService(opts);
  }

  /**
   * Replaces the tags of every key, all of them attempted. The first failure is thrown once every key has been tried,
   * so one bad object does not leave the others unsettled.
   *
   * `tags` are merged over the configured ones, for a call that knows more (a file that passed a later check).
   */
  async settle(opts: { keys: readonly string[]; tags?: Record<string, string> }): Promise<void> {
    const { helper } = this.options;
    const bucketName = await ResolverUtility.resolveValueAsync({ value: this.options.bucket });
    const tags = { ...this.options.tags, ...opts.tags };

    const results = await Promise.allSettled(
      opts.keys.map((key) =>
        helper.replaceObjectTags({ bucket: { name: bucketName }, object: { key }, tags }),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
  }
}
