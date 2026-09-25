/**
 * The original file name is the key only when no `normalizeNameFn` is given. With one, the name is
 * metadata: ordinary names pass, the generated key is what gets the segment rules, and every place
 * the name still reaches a header carries it in a header-safe form.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { IUploadFile } from '@/modules/storage/common';
import { DiskHelper } from '@/modules/storage/disk';
import { MinioHelper } from '@/modules/storage/minio';

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
      spyOn(fsp, 'writeFile').mockImplementation(async objectPath => {
        writtenPaths.push(String(objectPath));
      }),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  test.each(ORDINARY_NAMES)('an ordinary name uploads under the generated key: %s', async name => {
    const results = await helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: name })],
      normalizeNameFn: generateKey,
    });

    expect(results[0]?.object.key).toBe('inventory/2f9c41d0.xlsx');
    expect(writtenPaths).toHaveLength(1);
  });

  test('without a normalizeNameFn the name IS the key, so the segment rules still apply', async () => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'a&b.xlsx' })],
    });

    expect(await captureError({ task })).toBe('[upload] Invalid original file name');
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

    expect(await captureError({ task })).toBe('[upload] Invalid original file name');
    expect(writtenPaths).toHaveLength(0);
  });

  test('a normalizeNameFn that copies the name into the key gets the key rules', async () => {
    const task = helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'a&b.xlsx' })],
      normalizeNameFn: ({ file }) => `imports/${file.originalName}`,
    });

    expect(await captureError({ task })).toMatch(/Invalid normalized object name/);
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

    expect(await captureError({ task })).toMatch(/Invalid normalized object name/);
    expect(writtenPaths).toHaveLength(0);
  });
});

describe('MinioHelper.upload - the original name travels as header-safe metadata', () => {
  const metadataHeaders: Array<Headers> = [];
  let server: ReturnType<typeof Bun.serve>;
  let helper: MinioHelper;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch: request => {
        if (request.method === 'PUT') {
          metadataHeaders.push(request.headers);
        }
        return new Response('', { status: 200, headers: { etag: '"etag"' } });
      },
    });

    helper = new MinioHelper({
      endPoint: '127.0.0.1',
      port: server.port,
      useSSL: false,
      accessKey: 'access',
      secretKey: 'secret-key',
      region: 'us-east-1',
    });
  });

  afterAll(async () => {
    await server.stop(true);
  });

  /** RFC 2047, the form S3 uses for metadata outside US-ASCII. */
  const decodeEncodedWord = (opts: { value: string }): string => {
    const match = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=$/.exec(opts.value);
    return match ? Buffer.from(match[1], 'base64').toString('utf8') : opts.value;
  };

  test('a non-ASCII name is stored encoded instead of failing the request', async () => {
    await helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'Kiểm kê.xlsx' })],
      normalizeNameFn: generateKey,
    });

    const stored = metadataHeaders.at(-1)?.get('x-amz-meta-originalname') ?? '';
    expect(stored).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeEncodedWord({ value: stored })).toBe('Kiểm kê.xlsx');
  });

  test('a non-ASCII key reaches the metadata encoded as well', async () => {
    await helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'Kiểm kê.xlsx' })],
      normalizeNameFn: ({ file }) => `imports/${file.originalName}`,
    });

    const stored = metadataHeaders.at(-1)?.get('x-amz-meta-normalizename') ?? '';
    expect(decodeEncodedWord({ value: stored })).toBe('imports/Kiểm kê.xlsx');
  });

  test('an ASCII name is stored byte for byte, as before', async () => {
    await helper.upload({
      bucket: { name: 'assets' },
      files: [buildFile({ originalName: 'Stock & sales #1!.xlsx' })],
      normalizeNameFn: generateKey,
    });

    expect(metadataHeaders.at(-1)?.get('x-amz-meta-originalname')).toBe('Stock & sales #1!.xlsx');
  });
});
