import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskHelper } from '@/modules/storage/disk';

/** A link inside the storage root cannot lead outside it, for a read, a stat, a delete or a write; a write never creates the bucket either. */
const roots: string[] = [];

const build = () => {
  const base = mkdtempSync(join(tmpdir(), 'disk-symlink-'));
  roots.push(base);

  const root = join(base, 'root');
  const outside = join(base, 'outside');
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.txt'), 'outside-secret');
  writeFileSync(join(root, 'docs', 'real.txt'), 'inside');

  symlinkSync(join(outside, 'secret.txt'), join(root, 'docs', 'file-link.txt'));
  symlinkSync(outside, join(root, 'docs', 'dir-link'));
  symlinkSync(join(outside, 'missing.txt'), join(root, 'docs', 'dangling.txt'));
  symlinkSync(outside, join(root, 'bucket-link'));

  return { root, outside, helper: new DiskHelper({ basePath: root }), bucket: { name: 'docs' } };
};

const refusal = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;

    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

const bytes = (data: string) => new Blob([data]).stream() as ReadableStream<Uint8Array>;

afterEach(() => {
  for (const base of roots.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

describe('DiskHelper - a link cannot lead outside the root', () => {
  test.each(['file-link.txt', 'dir-link/secret.txt', 'dangling.txt'])(
    'every operation refuses %s',
    async (key) => {
      const { helper, bucket, outside } = build();
      const object = { key };

      const result = await refusal(helper.getObject({ bucket, object }));
      expect(result).toContain('Invalid object name');
      const result2 = await refusal(helper.getObjectStream({ bucket, object }));
      expect(result2).toContain('Invalid object name');
      const result3 = await refusal(helper.getStat({ bucket, object }));
      expect(result3).toContain('Invalid object name');
      const result4 = await refusal(helper.removeObject({ bucket, object }));
      expect(result4).toContain('Invalid object name');
      const result5 = await refusal(
        helper.writeStream({ bucket, object, source: bytes('changed') }),
      );
      expect(result5).toContain('Invalid object name');

      expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('outside-secret');
      expect(existsSync(join(outside, 'missing.txt'))).toBe(false);
    },
  );

  test('a write that would create a path beneath a link is refused and creates nothing outside', async () => {
    const { helper, bucket, outside } = build();

    const message = await refusal(
      helper.writeStream({ bucket, object: { key: 'dir-link/new/file.txt' }, source: bytes('x') }),
    );

    expect(message).toContain('Invalid object name');
    expect(existsSync(join(outside, 'new'))).toBe(false);
  });

  test('a bucket that is a link leading outside is not a bucket', async () => {
    const { helper } = build();
    const bucket = { name: 'bucket-link' };

    const result6 = await helper.hasBucket({ bucket });
    expect(result6).toBe(false);
    const result7 = await helper.getBucket({ bucket });
    expect(result7).toBeNull();
    const result8 = await helper.listObjects({ bucket });
    expect(result8).toEqual([]);
    const result9 = await refusal(helper.removeBucket({ bucket }));
    expect(result9).toContain('does not exist');
  });

  test('ordinary objects keep working, nested ones included', async () => {
    const { helper, bucket } = build();

    await helper.writeStream({ bucket, object: { key: 'a/b.txt' }, source: bytes('nested') });

    const result10 = await helper.getStat({ bucket, object: { key: 'real.txt' } });
    expect(result10.size).toBe(6);
    const result11 = await helper.getStat({ bucket, object: { key: 'a/b.txt' } });
    expect(result11.size).toBe(6);
    await helper.removeObject({ bucket, object: { key: 'a/b.txt' } });
  });
});

describe('DiskHelper - writeStream does not create the bucket', () => {
  test('a missing bucket is refused like upload does, and no directory appears', async () => {
    const { helper, root } = build();

    const message = await refusal(
      helper.writeStream({
        bucket: { name: 'ghost' },
        object: { key: 'f.txt' },
        source: bytes('x'),
      }),
    );

    expect(message).toContain('Bucket does not exist');
    expect(existsSync(join(root, 'ghost'))).toBe(false);
  });

  test('an existing bucket is written', async () => {
    const { helper, bucket } = build();

    await helper.writeStream({ bucket, object: { key: 'ok.txt' }, source: bytes('ok') });

    const result = await helper.getStat({ bucket, object: { key: 'ok.txt' } });
    expect(result.size).toBe(2);
  });
});
