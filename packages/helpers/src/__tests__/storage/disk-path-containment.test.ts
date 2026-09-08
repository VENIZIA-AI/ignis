/**
 * `upload` has validated its normalized name since the beginning; the READ and DELETE paths did not,
 * so a caller reaching the helper directly could step outside the bucket. These are the exploits.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskHelper } from '@/modules/storage/disk';

const roots: string[] = [];

const buildStorage = (): { root: string; helper: DiskHelper } => {
  const root = mkdtempSync(join(tmpdir(), 'disk-containment-'));
  roots.push(root);

  mkdirSync(join(root, 'images'), { recursive: true });
  writeFileSync(join(root, 'outside.txt'), 'not-yours');

  return { root, helper: new DiskHelper({ basePath: root }) };
};

const captureError = async (opts: { task: Promise<unknown> }): Promise<string> => {
  try {
    await opts.task;
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('DiskHelper - an object name cannot leave its bucket', () => {
  const escapes = ['../outside.txt', '../../outside.txt', 'nested/../../outside.txt'];

  test.each(escapes)('getObject rejects %s', async name => {
    const { helper } = buildStorage();

    const message = await captureError({
      task: helper.getObject({ bucket: { name: 'images' }, object: { key: name } }),
    });

    expect(message).toContain('Invalid object name');
  });

  test.each(escapes)('getStat rejects %s', async name => {
    const { helper } = buildStorage();

    const message = await captureError({
      task: helper.getStat({ bucket: { name: 'images' }, object: { key: name } }),
    });

    expect(message).toContain('Invalid object name');
  });

  test('removeObject rejects an escape and leaves the outside file alone', async () => {
    const { root, helper } = buildStorage();

    const message = await captureError({
      task: helper.removeObject({ bucket: { name: 'images' }, object: { key: '../outside.txt' } }),
    });

    expect(message).toContain('Invalid object name');
    expect(existsSync(join(root, 'outside.txt'))).toBe(true);
  });

  test('a bucket name cannot leave the storage root either', async () => {
    const { helper } = buildStorage();

    const message = await captureError({
      task: helper.getStat({ bucket: { name: '../..' }, object: { key: 'outside.txt' } }),
    });

    expect(message).toContain('Invalid bucket name');
  });

  test('an ordinary nested object still resolves', async () => {
    const { root, helper } = buildStorage();
    mkdirSync(join(root, 'images', 'photos'), { recursive: true });
    writeFileSync(join(root, 'images', 'photos', 'a.png'), 'ok');

    const stat = await helper.getStat({
      bucket: { name: 'images' },
      object: { key: 'photos/a.png' },
    });

    expect(stat.size).toBe(2);
  });
});
