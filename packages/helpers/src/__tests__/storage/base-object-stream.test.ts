/** The base has no stream of its own: a backend that streams overrides `getObjectStream`. */

import { describe, expect, test } from 'bun:test';
import type { Readable } from 'node:stream';
import { BaseStorageHelper } from '@/modules/storage/base';
import type {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IUploadFile,
} from '@/modules/storage/common';

/** The smallest backend: every operation but the base's own is unused. */
class BareHelper extends BaseStorageHelper {
  constructor() {
    super({ scope: 'bare', identifier: 'bare' });
  }

  override async getObject(): Promise<Readable> {
    throw new Error('not used');
  }

  protected get defaultLinkPrefix(): string {
    return '/bare/';
  }

  protected writeObject(_opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    throw new Error('not used');
  }

  hasBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('not used');
  }

  getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('not used');
  }

  getBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('not used');
  }

  createBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('not used');
  }

  removeBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('not used');
  }

  getStat(_opts: IObjectLocation): Promise<IFileStat> {
    throw new Error('not used');
  }

  removeObject(_opts: IObjectLocation): Promise<void> {
    throw new Error('not used');
  }

  removeObjects(_opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    throw new Error('not used');
  }

  listObjects(_opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    throw new Error('not used');
  }
}

const location: IObjectLocation = { bucket: { name: 'assets' }, object: { key: 'file.bin' } };

describe('BaseStorageHelper.getObjectStream', () => {
  test('is not supported by the base: a backend with a native stream overrides it', async () => {
    const helper = new BareHelper();

    let message = '';

    try {
      await helper.getObjectStream({ ...location, range: { start: 0, end: 2 } });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('getObjectStream');
    expect(message).toContain('is not supported by this helper');
  });
});
