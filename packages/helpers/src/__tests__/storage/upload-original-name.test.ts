/**
 * The original file name is the key only when no `normalizeNameFn` is given. With one, the name is
 * metadata: ordinary names pass, the generated key is what gets the segment rules, and every place
 * the name still reaches a header carries it in a header-safe form.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { type IUploadFile } from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';

/** Runs the upload and returns the thrown message - "" when it did NOT throw, which fails the match. */
const captureError = async (opts: { task: Promise<unknown> }): Promise<string> => {
  try {
    await opts.task;
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const buildFile = (opts: { originalName: string }): IUploadFile => ({
  originalName: opts.originalName,
  mimetype: 'application/octet-stream',
  buffer: Buffer.from('content'),
  size: 7,
});

/** What a `resolveObjectName` hook typically does: keep the extension, generate the rest. */
const generateKey = (opts: { file: { originalName: string } }): string => {
  const lastDot = opts.file.originalName.lastIndexOf('.');
  const extension = lastDot === -1 ? '' : opts.file.originalName.slice(lastDot).toLowerCase();
  return `inventory/2f9c41d0${extension}`;
};

/** Names a user picks every day; each one fails the segment rules a KEY must meet. */
const ORDINARY_NAMES = [
  'Báo cáo [Q3] & tổng hợp #1!.xlsx',
  'a;b$c{d}.xlsx',
  'Kiểm kê.xlsx',
  '.env.xlsx',
];

describe('BaseStorageHelper.upload - the original name when the key is generated', () => {
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
      spyOn(helper, 'hasBucket').mockResolvedValue(true),
      spyOn(fsp, 'mkdir').mockImplementation(async () => undefined),
      spyOn(fsp, 'writeFile').mockImplementation(async (objectPath) => {
        writtenPaths.push(String(objectPath));
      }),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  test.each(ORDINARY_NAMES)(
    'an ordinary name uploads under the generated key: %s',
    async (name) => {
      const results = await helper.upload({
        bucket: { name: 'assets' },
        files: [buildFile({ originalName: name })],
        normalizeNameFn: generateKey,
      });

      expect(results[0]?.object.key).toBe('inventory/2f9c41d0.xlsx');
      expect(writtenPaths).toHaveLength(1);
    },
  );

  test('without a normalizeNameFn the name IS the key, so the segment rules still apply', async () => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'a&b.xlsx' })],
    });

    const result = await captureError({ task });
    expect(result).toBe('[upload] Invalid original file name');
    expect(writtenPaths).toHaveLength(0);
  });

  test.each([
    ['a control character', 'bad\nname.xlsx'],
    ['a NUL', 'bad\u0000name.xlsx'],
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
    ['a name over 255 characters', `${'a'.repeat(252)}.xlsx`],
  ])('a generated key still refuses %s', async (_label, name) => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: name })],
      normalizeNameFn: generateKey,
    });

    const result = await captureError({ task });
    expect(result).toBe('[upload] Invalid original file name');
    expect(writtenPaths).toHaveLength(0);
  });

  test('a normalizeNameFn that copies the name into the key gets the key rules', async () => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'a&b.xlsx' })],
      normalizeNameFn: ({ file }) => `imports/${file.originalName}`,
    });

    const result = await captureError({ task });
    expect(result).toMatch(/Invalid normalized object name/);
    expect(writtenPaths).toHaveLength(0);
  });

  test('every key is checked before the first write, so one bad key stores nothing', async () => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [
        buildFile({ originalName: 'first.xlsx' }),
        buildFile({ originalName: 'second.xlsx' }),
      ],
      normalizeNameFn: ({ file }) =>
        file.originalName === 'second.xlsx' ? '../escape.xlsx' : `imports/${file.originalName}`,
    });

    const result = await captureError({ task });
    expect(result).toMatch(/Invalid normalized object name/);
    expect(writtenPaths).toHaveLength(0);
  });
});
