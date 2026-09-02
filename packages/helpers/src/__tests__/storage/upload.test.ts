/** Storage Upload Characterization Test Suite */

import { AnyType } from '@/common';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { IUploadFile } from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';
import { MinioHelper } from '@/modules/storage/minio';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

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

const captureErrorMessage = async (opts: { task: Promise<unknown> }): Promise<string> => {
  const { task } = opts;

  try {
    await task;
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

interface IWriteRecord {
  bucket: string;
  objectName: string;
  buffer: Buffer;
  metadata?: Record<string, AnyType>;
}

describe('Storage - upload', () => {
  describe('DiskHelper', () => {
    let helper: DiskHelper;
    let writes: IWriteRecord[];
    let bucketExists: boolean;
    let spies: Array<{ mockRestore: () => void }>;

    beforeEach(() => {
      writes = [];
      bucketExists = true;
      spies = [];

      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      helper = new DiskHelper({ basePath: '/virtual-storage' });
      existsSyncSpy.mockRestore();

      spies.push(
        spyOn(fsp, 'access').mockImplementation(async () => {
          if (!bucketExists) {
            throw new Error('ENOENT');
          }
        }),
        spyOn(fsp, 'stat').mockImplementation(
          async () => ({ isDirectory: () => bucketExists }) as AnyType,
        ),
        spyOn(fsp, 'mkdir').mockImplementation(async () => undefined),
        spyOn(fsp, 'writeFile').mockImplementation(async (objectPath: AnyType, data: AnyType) => {
          writes.push({
            bucket: 'n/a',
            objectName: String(objectPath),
            buffer: data as Buffer,
          });
        }),
      );
    });

    afterEach(() => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    });

    test('returns empty array when no files provided', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [] });
      expect(result).toEqual([]);
      expect(writes).toHaveLength(0);
    });

    test('throws when bucket does not exist', async () => {
      bucketExists = false;

      const message = await captureErrorMessage({
        task: helper.upload({ bucket: 'assets', files: [buildFile()] }),
      });

      expect(message).toBe('[upload] Bucket does not exist | name: assets');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid original file name (security gate)', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ originalName: '../../etc/passwd' })],
        }),
      });

      expect(message).toBe('[upload] Invalid original file name');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid folder path', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ folderPath: '../escape' })],
        }),
      });

      expect(message).toBe('[upload] Invalid folder path');
      expect(writes).toHaveLength(0);
    });

    test('rejects a MISSING size, but accepts a zero-byte file', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ size: undefined as AnyType })],
        }),
      });

      expect(message).toContain('[upload] Invalid file size');
      expect(writes).toHaveLength(0);

      // An empty file is a legal upload - only an absent or negative size is invalid.
      await helper.upload({ bucket: 'assets', files: [buildFile({ size: 0 })] });
      expect(writes).toHaveLength(1);
    });

    test('normalizes name and links with the disk prefix', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [buildFile()] });

      expect(result).toEqual([
        {
          bucketName: 'assets',
          objectName: 'hello_world.png',
          link: '/static-resources/assets/hello_world.png',
        },
      ]);
      expect(writes).toHaveLength(1);
      expect(writes[0].objectName.endsWith('/virtual-storage/assets/hello_world.png')).toBe(true);
      expect(writes[0].buffer.toString()).toBe('content');
    });

    test('prefixes normalized name with folder path and url-encodes link segments', async () => {
      const result = await helper.upload({
        bucket: 'assets',
        files: [buildFile({ originalName: 'report v1+final.png', folderPath: 'My Folder' })],
      });

      expect(result[0].objectName).toBe('my_folder/report_v1+final.png');
      expect(result[0].link).toBe('/static-resources/assets/my_folder/report_v1%2Bfinal.png');
    });

    test('honors normalizeNameFn and normalizeLinkFn overrides', async () => {
      const result = await helper.upload({
        bucket: 'assets',
        files: [buildFile()],
        normalizeNameFn: ({ originalName }) => `custom/${originalName}`,
        normalizeLinkFn: ({ bucketName, normalizeName }) =>
          `https://cdn/${bucketName}/${normalizeName}`,
      });

      expect(result[0].objectName).toBe('custom/Hello World.png');
      expect(result[0].link).toBe('https://cdn/assets/custom/Hello World.png');
    });
  });

  describe('MinioHelper', () => {
    let helper: MinioHelper;
    let writes: IWriteRecord[];
    let bucketExists: boolean;

    beforeEach(() => {
      writes = [];
      bucketExists = true;

      helper = new MinioHelper({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'accessKey',
        secretKey: 'secretKey',
      });

      helper['client'] = {
        bucketExists: async (_name: string) => bucketExists,
        putObject: async (
          bucket: string,
          objectName: string,
          buffer: Buffer,
          _size: number,
          metadata: Record<string, AnyType>,
        ) => {
          writes.push({ bucket, objectName, buffer, metadata });
        },
      } as AnyType;
    });

    test('returns empty array when no files provided', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [] });
      expect(result).toEqual([]);
      expect(writes).toHaveLength(0);
    });

    test('throws when bucket does not exist', async () => {
      bucketExists = false;

      const message = await captureErrorMessage({
        task: helper.upload({ bucket: 'assets', files: [buildFile()] }),
      });

      expect(message).toBe('[upload] Bucket does not exist | name: assets');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid original file name (security gate)', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ originalName: '../../etc/passwd' })],
        }),
      });

      expect(message).toBe('[upload] Invalid original file name');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid folder path', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ folderPath: '../escape' })],
        }),
      });

      expect(message).toBe('[upload] Invalid folder path');
      expect(writes).toHaveLength(0);
    });

    test('rejects a MISSING size, but accepts a zero-byte file', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ size: undefined as AnyType })],
        }),
      });

      expect(message).toContain('[upload] Invalid file size');
      expect(writes).toHaveLength(0);

      // An empty file is a legal upload - only an absent or negative size is invalid.
      await helper.upload({ bucket: 'assets', files: [buildFile({ size: 0 })] });
      expect(writes).toHaveLength(1);
    });

    test('normalizes name and links with the object storage prefix', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [buildFile()] });

      expect(result).toEqual([
        {
          bucketName: 'assets',
          objectName: 'hello_world.png',
          link: '/static-assets/assets/hello_world.png',
        },
      ]);
    });

    test('persists rich putObject metadata', async () => {
      await helper.upload({ bucket: 'assets', files: [buildFile()] });

      expect(writes).toHaveLength(1);
      expect(writes[0].bucket).toBe('assets');
      expect(writes[0].objectName).toBe('hello_world.png');
      expect(writes[0].metadata).toEqual({
        originalName: 'Hello World.png',
        normalizeName: 'hello_world.png',
        size: 7,
        encoding: '7bit',
        mimeType: 'image/png',
      });
    });

    test('honors normalizeNameFn and normalizeLinkFn overrides', async () => {
      const result = await helper.upload({
        bucket: 'assets',
        files: [buildFile()],
        normalizeNameFn: ({ originalName }) => `custom/${originalName}`,
        normalizeLinkFn: ({ bucketName, normalizeName }) =>
          `https://cdn/${bucketName}/${normalizeName}`,
      });

      expect(result[0].objectName).toBe('custom/Hello World.png');
      expect(result[0].link).toBe('https://cdn/assets/custom/Hello World.png');
      expect(writes[0].metadata?.normalizeName).toBe('custom/Hello World.png');
    });
  });

  describe('BunS3Helper', () => {
    let helper: BunS3Helper;
    let writes: IWriteRecord[];
    let bucketExists: boolean;

    beforeEach(() => {
      writes = [];
      bucketExists = true;

      helper = new BunS3Helper({
        accessKey: 'accessKey',
        secretKey: 'secretKey',
        endpoint: 'http://localhost:9000',
      });

      helper['client'] = {
        list: async () => {
          if (!bucketExists) {
            throw new Error('NoSuchBucket');
          }

          return { contents: [] };
        },
        write: async (
          objectName: string,
          buffer: Buffer,
          options: { bucket: string; type?: string },
        ) => {
          writes.push({
            bucket: options.bucket,
            objectName,
            buffer,
            metadata: { type: options.type },
          });
        },
      } as AnyType;
    });

    test('returns empty array when no files provided', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [] });
      expect(result).toEqual([]);
      expect(writes).toHaveLength(0);
    });

    test('throws when bucket does not exist', async () => {
      bucketExists = false;

      const message = await captureErrorMessage({
        task: helper.upload({ bucket: 'assets', files: [buildFile()] }),
      });

      expect(message).toBe('[upload] Bucket does not exist | name: assets');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid original file name (security gate)', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ originalName: '../../etc/passwd' })],
        }),
      });

      expect(message).toBe('[upload] Invalid original file name');
      expect(writes).toHaveLength(0);
    });

    test('rejects invalid folder path', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ folderPath: '../escape' })],
        }),
      });

      expect(message).toBe('[upload] Invalid folder path');
      expect(writes).toHaveLength(0);
    });

    test('rejects a MISSING size, but accepts a zero-byte file', async () => {
      const message = await captureErrorMessage({
        task: helper.upload({
          bucket: 'assets',
          files: [buildFile({ size: undefined as AnyType })],
        }),
      });

      expect(message).toContain('[upload] Invalid file size');
      expect(writes).toHaveLength(0);

      // An empty file is a legal upload - only an absent or negative size is invalid.
      await helper.upload({ bucket: 'assets', files: [buildFile({ size: 0 })] });
      expect(writes).toHaveLength(1);
    });

    test('normalizes name and links with the object storage prefix', async () => {
      const result = await helper.upload({ bucket: 'assets', files: [buildFile()] });

      expect(result).toEqual([
        {
          bucketName: 'assets',
          objectName: 'hello_world.png',
          link: '/static-assets/assets/hello_world.png',
        },
      ]);
    });

    test('writes with content type only', async () => {
      await helper.upload({ bucket: 'assets', files: [buildFile()] });

      expect(writes).toHaveLength(1);
      expect(writes[0].bucket).toBe('assets');
      expect(writes[0].objectName).toBe('hello_world.png');
      expect(writes[0].metadata).toEqual({ type: 'image/png' });
    });

    test('honors normalizeNameFn and normalizeLinkFn overrides', async () => {
      const result = await helper.upload({
        bucket: 'assets',
        files: [buildFile()],
        normalizeNameFn: ({ originalName }) => `custom/${originalName}`,
        normalizeLinkFn: ({ bucketName, normalizeName }) =>
          `https://cdn/${bucketName}/${normalizeName}`,
      });

      expect(result[0].objectName).toBe('custom/Hello World.png');
      expect(result[0].link).toBe('https://cdn/assets/custom/Hello World.png');
      expect(writes[0].objectName).toBe('custom/Hello World.png');
    });
  });
});
