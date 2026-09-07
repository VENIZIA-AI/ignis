/** BaseStorageHelper - presign/tagging methods refuse honestly when a backend has no transport for them (Task 3) */

import { BaseStorageHelper } from '@/modules/storage/base';
import { IBucketInfo, IFileStat, IObjectInfo, IUploadFile } from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';
import { describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import { Readable } from 'node:stream';

/** Minimal concrete subclass - proves the thrown message names THIS class, not a hardcoded one. */
class BareStorageHelper extends BaseStorageHelper {
  override isBucketExists(_opts: { name: string }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  override getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('Method not implemented.');
  }
  override getBucket(_opts: { name: string }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override createBucket(_opts: { name: string }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override removeBucket(_opts: { name: string }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  protected override get defaultLinkPrefix(): string {
    return '/bare-assets/';
  }
  protected override writeObject(_opts: {
    bucket: string;
    normalizeName: string;
    file: IUploadFile;
  }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override getFile(_opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    throw new Error('Method not implemented.');
  }
  override getStat(_opts: { bucket: string; name: string }): Promise<IFileStat> {
    throw new Error('Method not implemented.');
  }
  override removeObject(_opts: { bucket: string; name: string }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override removeObjects(_opts: { bucket: string; names: string[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override listObjects(_opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<IObjectInfo[]> {
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
      task: helper.presignPut({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('presignPut');
  });

  test('presignGet throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.presignGet({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('presignGet');
  });

  test('getObjectTags throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.getObjectTags({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('getObjectTags');
  });

  test('setObjectTags throws naming the class and the method', async () => {
    const message = await captureErrorMessage({
      task: helper.setObjectTags({ bucket: 'assets', name: 'file.png', tags: { temp: 'true' } }),
    });

    expect(message).toContain('BareStorageHelper');
    expect(message).toContain('setObjectTags');
  });
});

describe('DiskHelper - inherits the base refusal (no fake URL, no fake tags)', () => {
  const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
  const helper = new DiskHelper({ basePath: '/virtual-storage' });
  existsSyncSpy.mockRestore();

  test('presignPut throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.presignPut({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('presignPut');
  });

  test('presignGet throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.presignGet({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('presignGet');
  });

  test('getObjectTags throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.getObjectTags({ bucket: 'assets', name: 'file.png' }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('getObjectTags');
  });

  test('setObjectTags throws naming DiskHelper', async () => {
    const message = await captureErrorMessage({
      task: helper.setObjectTags({ bucket: 'assets', name: 'file.png', tags: {} }),
    });

    expect(message).toContain('DiskHelper');
    expect(message).toContain('setObjectTags');
  });
});
