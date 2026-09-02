import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { AnyType } from '@/common';
import { IUploadFile } from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';

/** Runs the upload and returns the thrown message - "" when it did NOT throw, which fails the match. */
const captureError = async (opts: { task: Promise<unknown> }): Promise<string> => {
  try {
    await opts.task;
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

const buildFile = (opts?: Partial<IUploadFile>): IUploadFile => {
  return {
    originalName: 'Hello World.png',
    mimetype: 'image/png',
    buffer: Buffer.from('content'),
    size: 7,
    encoding: '7bit',
    ...opts,
  };
};

describe('BaseStorageHelper.upload - the two guards on the shared path', () => {
  let helper: DiskHelper;
  let writtenPaths: Array<string>;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    writtenPaths = [];
    spies = [];

    const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
    helper = new DiskHelper({ basePath: '/virtual-storage' });
    existsSyncSpy.mockRestore();

    spies.push(
      spyOn(fsp, 'access').mockImplementation(async () => undefined),
      spyOn(fsp, 'stat').mockImplementation(async () => ({ isDirectory: () => true }) as AnyType),
      spyOn(fsp, 'mkdir').mockImplementation(async () => undefined),
      spyOn(fsp, 'writeFile').mockImplementation(async (objectPath: AnyType) => {
        writtenPaths.push(String(objectPath));
      }),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  test('a ZERO-BYTE file uploads - an empty file is legal, not an invalid size', async () => {
    const results = await helper.upload({
      bucket: 'assets',
      files: [buildFile({ size: 0, buffer: Buffer.alloc(0) })],
    });

    expect(results).toHaveLength(1);
    expect(writtenPaths).toHaveLength(1);
  });

  test('a MISSING size is still rejected', async () => {
    const task = helper.upload({
      bucket: 'assets',
      files: [buildFile({ size: undefined as AnyType })],
    });

    expect(await captureError({ task })).toMatch(/Invalid file size/);
    expect(writtenPaths).toHaveLength(0);
  });

  test('a NEGATIVE size is still rejected', async () => {
    const task = helper.upload({ bucket: 'assets', files: [buildFile({ size: -1 })] });

    expect(await captureError({ task })).toMatch(/Invalid file size/);
  });

  test('a normalizeNameFn escaping the bucket is rejected before anything is written', async () => {
    // The original name passes validation; the traversal is injected by the caller's own normalizer, whose output is what DiskHelper joins under the bucket root.
    const task = helper.upload({
      bucket: 'assets',
      files: [buildFile()],
      normalizeNameFn: () => '../../../etc/cron.d/pwn',
    });

    expect(await captureError({ task })).toMatch(/Invalid normalized object name/);
    expect(writtenPaths).toHaveLength(0);
  });

  test('a configured maxFolderDepth is HONOURED - not silently replaced by the hard default of 2', async () => {
    // Regression: the helper re-validated folderPath against its own hardcoded default of 2 even when the app configured maxFolderDepth higher, so depth-4 requests spooled the whole body to disk before failing.
    const results = await helper.upload({
      bucket: 'assets',
      files: [buildFile({ folderPath: 'a/b/c/d' })],
      maxFolderDepth: 4,
    });

    expect(results).toHaveLength(1);
    expect(writtenPaths[0]).toContain('a/b/c/d');
  });

  test('a folderPath DEEPER than the configured maxFolderDepth is still rejected', async () => {
    const task = helper.upload({
      bucket: 'assets',
      files: [buildFile({ folderPath: 'a/b/c/d/e' })],
      maxFolderDepth: 4,
    });

    expect(await captureError({ task })).toMatch(/Invalid folder path/);
    expect(writtenPaths).toHaveLength(0);
  });

  test('with no maxFolderDepth the default still applies', async () => {
    const task = helper.upload({
      bucket: 'assets',
      files: [buildFile({ folderPath: 'a/b/c' })],
    });

    expect(await captureError({ task })).toMatch(/Invalid folder path/);
  });

  test('a well-formed normalizeNameFn output still writes', async () => {
    const results = await helper.upload({
      bucket: 'assets',
      files: [buildFile()],
      normalizeNameFn: () => 'tenant-7/avatar.png',
    });

    expect(results).toHaveLength(1);
    expect(writtenPaths[0]).toContain('tenant-7/avatar.png');
  });
});
