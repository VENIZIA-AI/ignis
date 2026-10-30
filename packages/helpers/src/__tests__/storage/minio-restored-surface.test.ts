/** Deprecated but published, so it still owes the interface: 404 mapping, and a `maxKeys` that means what it says. The driver is stubbed. */

import { describe, expect, test } from 'bun:test';
import { Readable } from 'node:stream';
import { StorageErrors } from '@/modules/storage/common';
import { MinioHelper } from '@/modules/storage/minio';

/** Shaped like the driver failure `isNotFoundError` recognises. */
const notFound = (): Error =>
  Object.assign(new Error('The specified key does not exist.'), {
    code: 'NoSuchKey',
  });

const buildHelper = (client: Record<string, unknown>): MinioHelper => {
  const helper = new MinioHelper({ endPoint: 'localhost', accessKey: 'a', secretKey: 'b' });
  Reflect.set(helper, 'client', client);
  return helper;
};

const captureError = async (task: Promise<unknown>): Promise<any> => {
  try {
    await task;
    return undefined;
  } catch (error) {
    return error;
  }
};

describe('MinioHelper - the deprecated backend still meets the storage contract', () => {
  test('hasBucket refuses an invalid name without asking the server', async () => {
    let asked = false;
    const helper = buildHelper({
      bucketExists: async () => {
        asked = true;
        return true;
      },
    });

    const result = await helper.hasBucket({ bucket: { name: '../escape' } });
    expect(result).toBe(false);
    expect(asked).toBe(false);
  });

  test('hasBucket asks the server for a valid name', async () => {
    const helper = buildHelper({ bucketExists: async () => true });
    const result = await helper.hasBucket({ bucket: { name: 'assets' } });
    expect(result).toBe(true);
  });

  test('getObject turns a missing key into the catalogued 404', async () => {
    const helper = buildHelper({
      getObject: async () => {
        throw notFound();
      },
    });

    const error = await captureError(
      helper.getObject({ bucket: { name: 'assets' }, object: { key: 'gone.png' } }),
    );
    expect(error?.statusCode).toBe(StorageErrors.OBJECT_NOT_FOUND.statusCode);
  });

  test('getObject leaves an unrelated failure exactly as it was', async () => {
    const outage = new Error('connection reset');
    const helper = buildHelper({
      getObject: async () => {
        throw outage;
      },
    });

    const error = await captureError(
      helper.getObject({ bucket: { name: 'assets' }, object: { key: 'here.png' } }),
    );
    expect(error).toBe(outage);
  });

  test('getObject returns the driver stream untouched', async () => {
    const source = Readable.from(['payload']);
    const helper = buildHelper({ getObject: async () => source });
    const result = await helper.getObject({
      bucket: { name: 'assets' },
      object: { key: 'here.png' },
    });
    expect(result).toBe(source);
  });

  test('getStat turns a missing key into the catalogued 404', async () => {
    const helper = buildHelper({
      statObject: async () => {
        throw notFound();
      },
    });

    const error = await captureError(
      helper.getStat({ bucket: { name: 'assets' }, object: { key: 'gone.png' } }),
    );
    expect(error?.statusCode).toBe(StorageErrors.OBJECT_NOT_FOUND.statusCode);
  });

  test('maxKeys 0 means zero, and never reaches the server', async () => {
    let listed = false;
    const helper = buildHelper({
      listObjects: () => {
        listed = true;
        return Readable.from([]);
      },
    });

    const result = await helper.listObjects({ bucket: { name: 'assets' }, maxKeys: 0 });
    expect(result).toEqual([]);
    expect(listed).toBe(false);
  });

  test("maxKeys caps the result at the caller's limit", async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `object-${index}.png`,
      size: index,
      lastModified: new Date(0),
      etag: `etag-${index}`,
      prefix: undefined,
    }));

    const helper = buildHelper({ listObjects: () => Readable.from(entries, { objectMode: true }) });
    const objects = await helper.listObjects({ bucket: { name: 'assets' }, maxKeys: 2 });

    expect(objects.map((object) => object.name)).toEqual(['object-0.png', 'object-1.png']);
  });

  test('an absent maxKeys returns everything the driver streamed', async () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({ name: `object-${index}.png` }));
    const helper = buildHelper({ listObjects: () => Readable.from(entries, { objectMode: true }) });

    const result = await helper.listObjects({ bucket: { name: 'assets' } });
    expect(result).toHaveLength(3);
  });
});
