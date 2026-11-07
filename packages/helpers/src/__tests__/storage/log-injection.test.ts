/**
 * A log line of a storage helper never carries a caller's key, name or path raw. A key chosen by the
 * caller must not put a line break, a bidirectional override, an escape sequence or an invisible
 * character into the server log: it is escaped, and quoted, before it is written.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import util from 'node:util';
import { type AnyType } from '@/common/types';
import { BaseLogger, type ILogger, type TLogLevel } from '@/modules/logger';
import {
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IObjectRef,
  type IUploadFile,
} from '@/modules';
import { BaseStorageHelper } from '@/modules/storage/base';
import { BunS3Helper } from '@/modules/storage/bun-s3';
import { DiskHelper } from '@/modules/storage/disk';
import { type Readable } from 'node:stream';

/** Every line the helper wrote, formatted the way a provider formats it (`util.format`). */
class RecordingLogger extends BaseLogger {
  readonly lines: string[];

  constructor(opts: { scope: string; lines?: string[] }) {
    super(opts);
    this.lines = opts.lines ?? [];
  }

  protected write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }): void {
    this.lines.push(util.format(`${this._formattedPrefix}${opts.message}`, ...opts.args));
  }

  protected child(opts: { scope: string }): ILogger {
    return new RecordingLogger({ scope: opts.scope, lines: this.lines });
  }
}

/** The raw characters that forge or hide a log line: a line break, a bidi override, a line separator, an ANSI escape, a zero-width space. */
const LINE_BREAK = '\n';
const OVERRIDE = '\u202e';
const SEPARATOR = '\u2028';
const ANSI = '\u001b[31m';
const ZERO_WIDTH = '\u200b';
const FORGED_LINE = 'FORGED ERROR admin logged in';

const DIRTY = `${LINE_BREAK}${FORGED_LINE}${OVERRIDE}${SEPARATOR}${ANSI}${ZERO_WIDTH}`;

const RAW_UNSAFE = /[\p{Cc}\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;

const expectCleanLines = (opts: { lines: string[] }): void => {
  expect(opts.lines.length).toBeGreaterThan(0);

  for (const line of opts.lines) {
    expect(line).not.toMatch(RAW_UNSAFE);
    // The prefix is the logger's own; a forged second line would start after a break, and there is none.
    expect(line.split(/\r\n|\r|\n|\u2028|\u2029/)).toHaveLength(1);
  }
};

class ProbeHelper extends BaseStorageHelper {
  override hasBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    return Promise.resolve(true);
  }

  override getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('Method not implemented.');
  }

  override getBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }

  override createBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }

  override removeBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  protected override get defaultLinkPrefix(): string {
    return '/probe/';
  }

  protected override writeObject(_opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    return Promise.resolve();
  }

  override getObject(_opts: IObjectLocation & { options?: any }): Promise<Readable> {
    throw new Error('Method not implemented.');
  }

  override getStat(_opts: IObjectLocation): Promise<IFileStat> {
    throw new Error('Method not implemented.');
  }

  override removeObject(_opts: IObjectLocation): Promise<void> {
    throw new Error('Method not implemented.');
  }

  override removeObjects(_opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  override listObjects(_opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    throw new Error('Method not implemented.');
  }

  checkOriginalName(opts: { name: string }): boolean {
    return this.isValidOriginalName(opts);
  }
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const buildDisk = () => {
  const root = mkdtempSync(join(tmpdir(), 'storage-log-injection-'));
  roots.push(root);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'file.txt'), 'inside');

  const logger = new RecordingLogger({ scope: '' });
  const helper = new DiskHelper({ basePath: root });
  helper.logger = logger;

  return { helper, logger };
};

const buildS3 = () => {
  const logger = new RecordingLogger({ scope: '' });
  const helper = new BunS3Helper({
    accessKey: 'AKIAEXAMPLE',
    secretKey: 'secret',
    endpoint: { default: 'http://127.0.0.1:9' },
  });
  helper.logger = logger;

  return { helper, logger };
};

const buildProbe = () => {
  const logger = new RecordingLogger({ scope: '' });
  const helper = new ProbeHelper({ scope: 'Probe', identifier: 'probe' });
  helper.logger = logger;

  return { helper, logger };
};

/** Each entry reaches a different log line of the shared validation; the value is in the line. */
const SEGMENT_CASES: Array<[string, string]> = [
  ['a path character', `..${DIRTY}`],
  ['a leading dot', `.${DIRTY}`],
  ['a shell character', `a;${DIRTY}`],
  ['a control character', `a${DIRTY}`],
  ['a zero-width space only, too long', `${'a'.repeat(256)}${ZERO_WIDTH}`],
];

const KEY_CASES: Array<[string, string]> = [
  ['a segment that fails', `folder/${DIRTY}`],
  ['an empty segment', `a${ZERO_WIDTH}//b`],
  ['a key too deep', `a/b/c/d${ZERO_WIDTH}/e`],
  ['a key too long', `${Array.from({ length: 6 }, () => 'a'.repeat(200)).join('/')}${ZERO_WIDTH}`],
];

describe('storage helpers - a log line escapes what the caller chose', () => {
  describe('BaseStorageHelper validation (shared by every helper)', () => {
    test.each(SEGMENT_CASES)('a segment with %s', (_name, segment) => {
      const { helper, logger } = buildProbe();

      expect(helper.isValidSegment({ segment })).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test.each(KEY_CASES)('an object key with %s', (_name, key) => {
      const { helper, logger } = buildProbe();

      expect(
        helper.isValidObjectKey({ object: { key }, maxDepth: key.includes('a/b/c') ? 2 : 100 }),
      ).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test('a bucket name is escaped', () => {
      const { helper, logger } = buildProbe();

      expect(helper.isValidBucketName({ bucket: { name: `b;${DIRTY}` } })).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test('a value that is not a string is escaped', () => {
      const { helper, logger } = buildProbe();

      expect(
        helper.isValidSegment({ segment: { name: `x${SEPARATOR}${OVERRIDE}` } as never }),
      ).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test('an original name is escaped', () => {
      const { helper, logger } = buildProbe();

      expect(helper.checkOriginalName({ name: `a${DIRTY}` })).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test('the rejected segment and the whole key are logged escaped and quoted', () => {
      const { helper, logger } = buildProbe();

      helper.isValidObjectKey({ object: { key: `folder/a${OVERRIDE}b` } });

      const line = logger.lines.find((entry) => entry.includes('Path segment failed validation'));

      expect(line).toBe(
        '[isValidKeyPath] Path segment failed validation: "a\\u202eb" (in path: "folder/a\\u202eb")',
      );
    });

    test('a normal key is logged readably, and still quoted', () => {
      const { helper, logger } = buildProbe();

      helper.isValidObjectKey({ object: { key: 'photos//a b.png' } });

      expect(logger.lines).toEqual([
        '[isValidKeyPath] Path contains empty segments (double slashes): "photos//a b.png"',
      ]);
    });

    test('an uploaded file logs its key, link and type escaped', async () => {
      const { helper, logger } = buildProbe();
      const bucket = { name: 'docs' };

      await helper.upload({
        bucket,
        files: [
          {
            originalName: `a${ZERO_WIDTH}b.txt`,
            folderPath: undefined,
            mimetype: `text/plain${SEPARATOR}${FORGED_LINE}${OVERRIDE}`,
            buffer: Buffer.from('x'),
            size: 1,
          } as IUploadFile,
        ],
      });

      const line = logger.lines.find((entry) => entry.includes('Uploaded'));

      expect(line).toContain('"key":"a\\u200bb.txt"');
      expect(line).toContain('\\u2028');
      expectCleanLines({ lines: logger.lines });
    });
  });

  describe('DiskHelper', () => {
    test('a key that fails validation is escaped in every line', async () => {
      const { helper, logger } = buildDisk();
      let thrown: unknown;

      try {
        await helper.getObject({ bucket: { name: 'docs' }, object: { key: `folder/${DIRTY}` } });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();
      expectCleanLines({ lines: logger.lines });
    });

    test('a path that cannot be read is logged escaped', async () => {
      const { helper, logger } = buildDisk();

      // `file.txt` is a file: a key below it is ENOTDIR, which is logged with the path.
      const key = `file.txt/a${ZERO_WIDTH}b`;
      let thrown: unknown;

      try {
        await helper.getObject({ bucket: { name: 'docs' }, object: { key } });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();

      const line = logger.lines.find((entry) => entry.includes('Cannot determine existence'));

      expect(line).toBeDefined();
      expect(line).toContain('a\\u200bb');
      expectCleanLines({ lines: logger.lines });
    });

    test('a normal key is logged readably, and still quoted', () => {
      const { helper, logger } = buildDisk();

      expect(helper.isValidObjectKey({ object: { key: 'a//b.txt' } })).toBe(false);
      expect(logger.lines).toContain(
        '[isValidKeyPath] Path contains empty segments (double slashes): "a//b.txt"',
      );
    });
  });

  describe('BunS3Helper', () => {
    test('a key that fails validation is escaped in every line', () => {
      const { helper, logger } = buildS3();

      expect(helper.isValidObjectKey({ object: { key: `folder/${DIRTY}` } })).toBe(false);
      expectCleanLines({ lines: logger.lines });
    });

    test('a bucket the server fails on is logged escaped', async () => {
      const { helper, logger } = buildS3();
      const failure = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });

      (helper as unknown as { client: unknown }).client = {
        list: () => Promise.reject(failure),
      };

      const bucket = { name: `bucket${ZERO_WIDTH}one` };
      const result = await helper.hasBucket({ bucket });

      expect(result).toBe(false);

      const line = logger.lines.find((entry) => entry.includes('Cannot determine bucket'));

      expect(line).toContain('bucket: "bucket\\u200bone" | ');
      // The failure's own block is the logger's multi-line format; the caller's bucket name is on the first line.
      expectCleanLines({ lines: [line?.split('\n')[0] ?? ''] });
      expect(line).not.toContain(ZERO_WIDTH);
    });

    test('a normal bucket is logged readably, and still quoted', async () => {
      const { helper, logger } = buildS3();
      const failure = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });

      (helper as unknown as { client: unknown }).client = {
        list: () => Promise.reject(failure),
      };

      await helper.hasBucket({ bucket: { name: 'uploads' } });

      expect(logger.lines[0]).toContain('bucket: "uploads"');
    });
  });
});

/** A thrown message reaches the caller and, through the application's error handler, the error log: the same escaping applies. */
describe('storage helpers - a thrown message escapes what the caller chose', () => {
  const refusal = async (task: Promise<unknown>): Promise<Error> => {
    try {
      await task;
    } catch (error) {
      return error as Error;
    }

    throw new Error('expected the task to fail');
  };

  const expectCleanMessage = (opts: { error: Error }): void => {
    expect(opts.error.message).not.toMatch(RAW_UNSAFE);
    expect(opts.error.message.split(/\r\n|\r|\n|\u2028|\u2029/)).toHaveLength(1);
  };

  test('DiskHelper: an invalid key', async () => {
    const { helper } = buildDisk();
    const error = await refusal(
      helper.getObject({ bucket: { name: 'docs' }, object: { key: `folder/${DIRTY}` } }),
    );

    expect(error.message).toContain('Invalid object name | key: folder/');
    expect(error.message).toContain('\\u202e');
    expectCleanMessage({ error });
  });

  test('DiskHelper: an invalid bucket name', async () => {
    const { helper } = buildDisk();
    const error = await refusal(
      helper.getObject({ bucket: { name: `b;${DIRTY}` }, object: { key: 'a.txt' } }),
    );

    expect(error.message).toContain('Invalid bucket name | bucket: b;');
    expectCleanMessage({ error });
  });

  test('DiskHelper: a missing object whose key holds a zero-width space', async () => {
    const { helper } = buildDisk();
    const error = await refusal(
      helper.getObject({ bucket: { name: 'docs' }, object: { key: `missing${ZERO_WIDTH}.txt` } }),
    );

    expect(error.message).toBe(
      '[getObject] Object not found | bucket: docs | key: missing\\u200b.txt',
    );
  });

  test('DiskHelper: an ordinary key reads exactly as it did', async () => {
    const { helper } = buildDisk();
    const error = await refusal(
      helper.getObject({ bucket: { name: 'docs' }, object: { key: 'Báo cáo "Q3".txt' } }),
    );

    expect(error.message).toBe(
      '[getObject] Object not found | bucket: docs | key: Báo cáo "Q3".txt',
    );
  });

  test('BaseStorageHelper.writeStream: an invalid key', async () => {
    const { helper } = buildProbe();
    const error = await refusal(
      helper.writeStream({
        bucket: { name: 'docs' },
        object: { key: `folder/${DIRTY}` },
        source: new Blob(['x']),
      }),
    );

    expect(error.message).toContain('[writeStream] Invalid object name | key: folder/');
    expectCleanMessage({ error });
  });

  test('BaseStorageHelper.upload: a resolved key that fails', async () => {
    const { helper } = buildProbe();
    const error = await refusal(
      helper.upload({
        bucket: { name: 'docs' },
        files: [
          { originalName: 'a.txt', mimetype: 'text/plain', buffer: Buffer.from('x'), size: 1 },
        ],
        normalizeNameFn: () => `folder/${DIRTY}`,
      }),
    );

    expect(error.message).toContain('Invalid normalized object name | name: folder/');
    expectCleanMessage({ error });
  });

  test('BunS3Helper: an invalid key and a bucket that cannot be a host label', async () => {
    const { helper } = buildS3();
    const writeError = await refusal(
      helper.writeStream({
        bucket: { name: 'docs' },
        object: { key: `folder/${DIRTY}` },
        source: new Blob(['x']),
      }),
    );

    expect(writeError.message).toContain('[writeStream] Invalid object name | key: folder/');
    expectCleanMessage({ error: writeError });

    const hosted = new BunS3Helper({
      accessKey: 'AKIAEXAMPLE',
      secretKey: 'secret',
      endpoint: { default: 'http://127.0.0.1:9' },
      virtualHostedStyle: true,
    });
    const bucketError = await refusal(
      hosted.presignGet({ bucket: { name: `Bad${DIRTY}` }, object: { key: 'a.txt' } }),
    );

    expect(bucketError.message).toContain('bucket:');
    expectCleanMessage({ error: bucketError });
  });
});
