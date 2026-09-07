/** `listObjects` used one `list` call, so any bucket past 1000 keys was silently truncated. */

import { describe, expect, test } from 'bun:test';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { Readable } from 'node:stream';

interface IListCall {
  prefix?: string;
  continuationToken?: string;
  delimiter?: string;
  maxKeys?: number;
}

const buildHelper = (opts: {
  pages: Array<{ keys: string[]; isTruncated?: boolean }>;
}): { helper: BunS3Helper; calls: IListCall[] } => {
  const helper = new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
  });

  const calls: IListCall[] = [];
  let pageIndex = 0;

  Reflect.set(Reflect.get(helper, 'client'), 'list', async (listOptions: IListCall) => {
    calls.push({ ...listOptions });
    const page = opts.pages[pageIndex] ?? { keys: [] };
    pageIndex += 1;

    return {
      contents: page.keys.map(key => ({ key, size: 1, eTag: 'tag' })),
      isTruncated: page.isTruncated ?? false,
      nextContinuationToken: page.isTruncated ? `token-${pageIndex}` : undefined,
    };
  });

  return { helper, calls };
};

describe('BunS3Helper.listObjects - pagination', () => {
  test('follows the continuation token instead of stopping at the first page', async () => {
    const { helper, calls } = buildHelper({
      pages: [
        { keys: ['a', 'b'], isTruncated: true },
        { keys: ['c', 'd'], isTruncated: true },
        { keys: ['e'], isTruncated: false },
      ],
    });

    const objects = await helper.listObjects({ bucket: 'assets' });

    expect(objects.map(object => object.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(calls).toHaveLength(3);
    expect(calls[0].continuationToken).toBeUndefined();
    expect(calls[1].continuationToken).toBe('token-1');
  });

  test('stops once maxKeys is reached, without asking for another page', async () => {
    const { helper, calls } = buildHelper({
      pages: [
        { keys: ['a', 'b'], isTruncated: true },
        { keys: ['c', 'd'], isTruncated: true },
      ],
    });

    const objects = await helper.listObjects({ bucket: 'assets', maxKeys: 2 });

    expect(objects).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  test('maxKeys 0 returns nothing and never calls the backend', async () => {
    const { helper, calls } = buildHelper({ pages: [{ keys: ['a'] }] });

    const objects = await helper.listObjects({ bucket: 'assets', maxKeys: 0 });

    expect(objects).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('BunS3Helper.listObjects - useRecursive', () => {
  test('useRecursive false groups by delimiter, matching the disk backend', async () => {
    const { helper, calls } = buildHelper({ pages: [{ keys: ['a'] }] });

    await helper.listObjects({ bucket: 'assets', useRecursive: false });

    expect(calls[0].delimiter).toBe('/');
  });

  test('the default stays recursive, so no delimiter is sent', async () => {
    const { helper, calls } = buildHelper({ pages: [{ keys: ['a'] }] });

    await helper.listObjects({ bucket: 'assets' });

    expect(calls[0].delimiter).toBeUndefined();
  });
});

describe('BunS3Helper.getFile - the object is streamed, not buffered', () => {
  test('returns a readable without reading the object first', async () => {
    const helper = new BunS3Helper({
      accessKey: 'AK',
      secretKey: 'SK',
      endpoint: 'http://127.0.0.1:59999',
      region: 'us-east-1',
    });

    // The endpoint is unreachable on purpose: a lazy stream still constructs, a buffering read would throw.
    const stream = await helper.getFile({ bucket: 'assets', name: 'photo.png' });

    expect(stream).toBeInstanceOf(Readable);
  });
});
