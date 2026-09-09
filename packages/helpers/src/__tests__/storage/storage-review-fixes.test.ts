/** The behaviours the storage review changed: bounded concurrency, an honest `maxKeys`, and a copied container. */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskHelper } from '@/modules/storage/disk';
import { MemoryStorageHelper } from '@/modules/storage/in-memory';
import { StorageConcurrency } from '@/modules/storage/common';
import type { IUploadFile } from '@/modules/storage/common';

const roots: string[] = [];

const buildDisk = (): { root: string; helper: DiskHelper } => {
  const root = mkdtempSync(join(tmpdir(), 'storage-review-'));
  roots.push(root);
  mkdirSync(join(root, 'images'), { recursive: true });

  return { root, helper: new DiskHelper({ basePath: root }) };
};

const buildFile = (name: string): IUploadFile => ({
  originalName: name,
  mimetype: 'image/png',
  buffer: Buffer.from('x'),
  size: 1,
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('upload runs with bounded concurrency', () => {
  /** Unbounded, 200 files meant 200 simultaneous writes; the ceiling is what keeps sockets and handles finite. */
  test('never exceeds the configured limit, and still writes every file', async () => {
    const { helper } = buildDisk();
    const files = Array.from({ length: 200 }, (_, index) => buildFile(`file-${index}.png`));

    let inFlight = 0;
    let peak = 0;
    const originalWrite = Reflect.get(helper, 'writeObject').bind(helper);
    Reflect.set(helper, 'writeObject', async (opts: unknown) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      const result = await originalWrite(opts);
      inFlight -= 1;
      return result;
    });

    const results = await helper.upload({ bucket: { name: 'images' }, files });

    expect(results).toHaveLength(200);
    expect(peak).toBeLessThanOrEqual(StorageConcurrency.DEFAULT_LIMIT);
    expect(peak).toBeGreaterThan(1);
  });

  test('results keep the order of the input, not the order they finished', async () => {
    const { helper } = buildDisk();
    const files = Array.from({ length: 40 }, (_, index) => buildFile(`ordered-${index}.png`));

    const results = await helper.upload({ bucket: { name: 'images' }, files });

    expect(results.map(result => result.object.key)).toEqual(
      files.map(file => file.originalName.toLowerCase()),
    );
  });
});

describe('listObjects treats maxKeys as a number, not a truthiness', () => {
  test('maxKeys 0 returns nothing instead of everything', async () => {
    const { root, helper } = buildDisk();
    writeFileSync(join(root, 'images', 'a.png'), 'a');
    writeFileSync(join(root, 'images', 'b.png'), 'b');

    const objects = await helper.listObjects({ bucket: { name: 'images' }, maxKeys: 0 });

    expect(objects).toEqual([]);
  });

  test('maxKeys caps the result', async () => {
    const { root, helper } = buildDisk();
    for (const name of ['a.png', 'b.png', 'c.png']) {
      writeFileSync(join(root, 'images', name), 'x');
    }

    const objects = await helper.listObjects({ bucket: { name: 'images' }, maxKeys: 2 });

    expect(objects).toHaveLength(2);
  });

  test('an omitted maxKeys still returns everything', async () => {
    const { root, helper } = buildDisk();
    for (const name of ['a.png', 'b.png', 'c.png']) {
      writeFileSync(join(root, 'images', name), 'x');
    }

    const objects = await helper.listObjects({ bucket: { name: 'images' } });

    expect(objects).toHaveLength(3);
  });
});

describe('MemoryStorageHelper does not leak its own state', () => {
  test('getContainer returns a copy, so a caller cannot mutate the helper', () => {
    const helper = MemoryStorageHelper.newInstance<{ token: string }>();
    helper.set('token', 'first');

    const container = helper.getContainer();
    container['token'] = 'tampered';

    expect(helper.get('token')).toBe('first');
  });

  test('unset reports whether the key was actually bound', () => {
    const helper = MemoryStorageHelper.newInstance<{ token: string }>();
    helper.set('token', 'value');

    expect(helper.unset('token')).toBe(true);
    expect(helper.unset('token')).toBe(false);
    expect(helper.isBound('token')).toBe(false);
    expect(helper.size).toBe(0);
  });
});
