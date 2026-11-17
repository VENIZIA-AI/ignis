/** `listObjects` lists only the top level unless the caller asks for the tree, on every backend. */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { DiskHelper } from '@/modules/storage/disk';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A bucket holding `top.txt` and `folder/nested.txt`. */
const buildDisk = (): DiskHelper => {
  const root = mkdtempSync(join(tmpdir(), 'list-default-'));
  roots.push(root);
  mkdirSync(join(root, 'assets', 'folder'), { recursive: true });
  writeFileSync(join(root, 'assets', 'top.txt'), 'x');
  writeFileSync(join(root, 'assets', 'folder', 'nested.txt'), 'x');

  return new DiskHelper({ basePath: root });
};

/** A Bun S3 helper whose client records the delimiter of each `list` call. */
const buildS3 = (): { helper: BunS3Helper; delimiters: Array<string | undefined> } => {
  const helper = new BunS3Helper({
    accessKey: 'AK',
    secretKey: 'SK',
    endpoint: { default: 'https://s3.us-east-1.amazonaws.com' },
    region: 'us-east-1',
  });

  const delimiters: Array<string | undefined> = [];

  Reflect.set(
    Reflect.get(helper, 'client'),
    'list',
    async (listOptions: { delimiter?: string }) => {
      delimiters.push(listOptions.delimiter);

      return { contents: [{ key: 'top.txt', size: 1, eTag: 'tag' }], isTruncated: false };
    },
  );

  return { helper, delimiters };
};

describe('listObjects useRecursive default', () => {
  test('the disk helper lists the top level only', async () => {
    const objects = await buildDisk().listObjects({ bucket: { name: 'assets' } });

    expect(objects.map((object) => object.name)).toEqual(['top.txt']);
  });

  test('the Bun S3 helper asks for the top level only', async () => {
    const { helper, delimiters } = buildS3();

    await helper.listObjects({ bucket: { name: 'assets' } });

    expect(delimiters).toEqual(['/']);
  });

  test('useRecursive true lists the tree on disk and sends no delimiter to S3', async () => {
    const disk = await buildDisk().listObjects({
      bucket: { name: 'assets' },
      useRecursive: true,
    });
    const { helper, delimiters } = buildS3();

    await helper.listObjects({ bucket: { name: 'assets' }, useRecursive: true });

    expect(disk.map((object) => object.name).sort()).toEqual(['folder/nested.txt', 'top.txt']);
    expect(delimiters).toEqual([undefined]);
  });
});
