/** The base range fallback is the path a backend with no native ranged GET takes. */

import { describe, expect, test } from 'bun:test';
import { Readable } from 'node:stream';
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

/** Counts what the backend actually produced, so buffering shows up as a number. */
class CountingHelper extends BaseStorageHelper {
  chunksRead = 0;
  isDestroyed = false;

  constructor(private readonly chunks: string[]) {
    super({ scope: 'counting', identifier: 'counting' });
  }

  override async getObject(): Promise<Readable> {
    const source = Readable.from(
      (function* (owner: CountingHelper, parts: string[]) {
        for (const part of parts) {
          owner.chunksRead += 1;
          yield Buffer.from(part);
        }
      })(this, this.chunks),
    );

    source.on('close', () => {
      this.isDestroyed = true;
    });

    return source;
  }

  protected get defaultLinkPrefix(): string {
    return '/counting/';
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

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  return Buffer.concat(parts).toString();
};

describe('BaseStorageHelper.getObjectStream - the range fallback', () => {
  test('serves exactly the requested window', async () => {
    const helper = new CountingHelper(['abcde', 'fghij', 'klmno']);
    const stream = await helper.getObjectStream({ ...location, range: { start: 3, end: 8 } });

    expect(await readAll(stream)).toBe('defghi');
  });

  test('an open-ended range runs to the end of the object', async () => {
    const helper = new CountingHelper(['abcde', 'fghij']);
    const stream = await helper.getObjectStream({ ...location, range: { start: 7 } });

    expect(await readAll(stream)).toBe('hij');
  });

  test('stops reading the backend once the range is covered', async () => {
    const helper = new CountingHelper(['abcde', 'fghij', 'klmno', 'pqrst']);
    const stream = await helper.getObjectStream({ ...location, range: { start: 0, end: 4 } });

    await readAll(stream);

    // The window ends inside chunk 1; chunks 2-4 must never be produced.
    expect(helper.chunksRead).toBe(1);
  });

  test('does not read the whole range before the consumer asks', async () => {
    const helper = new CountingHelper(['abcde', 'fghij', 'klmno', 'pqrst']);
    const stream = await helper.getObjectStream({ ...location, range: { start: 0, end: 19 } });
    const reader = stream.getReader();

    await reader.read();

    // One read must not have drained the backend; buffering the whole range is the bug.
    expect(helper.chunksRead).toBeLessThan(4);
    await reader.cancel();
  });

  test('a cancelled consumer destroys the backend stream', async () => {
    const helper = new CountingHelper(['abcde', 'fghij', 'klmno']);
    const stream = await helper.getObjectStream({ ...location, range: { start: 0, end: 14 } });
    const reader = stream.getReader();

    await reader.read();
    await reader.cancel();

    // `destroy()` emits `close` on a later tick, so the flag is read after the loop drains.
    await new Promise(resolve => setImmediate(resolve));

    expect(helper.isDestroyed).toBe(true);
  });
});
