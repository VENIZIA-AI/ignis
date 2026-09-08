/** BaseStorageHelper - presign/tagging methods refuse honestly when a backend has no transport for them (Task 3) */

import { BaseStorageHelper } from '@/modules/storage/base';
import {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IUploadFile,
} from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';
import { describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import { Readable } from 'node:stream';

/** Minimal concrete subclass - proves the thrown message names THIS class, not a hardcoded one. */
class BareStorageHelper extends BaseStorageHelper {
  override hasBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  override getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('Method not implemented.');
  }
  override getBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override createBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override removeBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  protected override get defaultLinkPrefix(): string {
    return '/bare-assets/';
  }
  protected override writeObject(_opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override getObject(_opts: IObjectLocation & { options?: any }): Promise<Readable> {
    throw new Error('Method not implemented.');
  }
  override getStat(_opts: IObjectLocation): Promise<IFileStat> {
    throw new Error('Method not implemented.');
  }
  override removeObject(_opts: IObjectLocation): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override removeObjects(_opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override listObjects(_opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    throw new Error('Method not implemented.');
  }
}

const captureErrorMessage = async (opts: { task: Promise<unknown> }): Promise<string> => {
  try {
    await opts.task;
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('BaseStorageHelper - presign/tagging refusal', () => {
  const helper = new BareStorageHelper({ scope: 'bare', identifier: 'bare-helper' });

  test('presignPut throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.presignPut({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('presignPut');
  });

  test('presignGet throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.presignGet({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('presignGet');
  });

  test('getObjectTags throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.getObjectTags({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('getObjectTags');
  });

  test('replaceObjectTags throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.replaceObjectTags({
        bucket: { name: 'assets' },
        object: { key: 'file.png' },
        tags: { temp: 'true' },
      }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('replaceObjectTags');
  });
});

describe('DiskHelper - inherits the base refusal (no fake URL, no fake tags)', () => {
  const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
  const helper = new DiskHelper({ basePath: '/virtual-storage' });
  existsSyncSpy.mockRestore();

  test('presignPut throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.presignPut({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('presignPut');
  });

  test('presignGet throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.presignGet({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('presignGet');
  });

  test('getObjectTags throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.getObjectTags({ bucket: { name: 'assets' }, object: { key: 'file.png' } }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('getObjectTags');
  });

  test('replaceObjectTags throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.replaceObjectTags({
        bucket: { name: 'assets' },
        object: { key: 'file.png' },
        tags: {},
      }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('replaceObjectTags');
  });
});
