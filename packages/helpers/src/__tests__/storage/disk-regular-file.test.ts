import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskHelper } from '@/modules/storage/disk';

/** An object is a regular file. A directory under the same path is not an object: every call answers "not found" and touches nothing. */
const roots: string[] = [];

const build = () => {
  const root = mkdtempSync(join(tmpdir(), 'disk-regular-file-'));
  roots.push(root);

  mkdirSync(join(root, 'docs', 'folder'), { recursive: true });
  writeFileSync(join(root, 'docs', 'real.txt'), 'content');

  return { root, helper: new DiskHelper({ basePath: root }), bucket: { name: 'docs' } };
};

const refusal = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;

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

describe('DiskHelper - a directory is not an object', () => {
  test('getObject, getObjectStream, getStat and removeObject answer not found', async () => {
    const { helper, bucket, root } = build();
    const object = { key: 'folder' };

    const result = await refusal(helper.getObject({ bucket, object }));
    expect(result).toContain('Object not found');
    const result2 = await refusal(helper.getObjectStream({ bucket, object }));
    expect(result2).toContain('Object not found');
    const result3 = await refusal(helper.getStat({ bucket, object }));
    expect(result3).toContain('Object not found');
    const result4 = await refusal(helper.removeObject({ bucket, object }));
    expect(result4).toContain('Object not found');
    expect(existsSync(join(root, 'docs', 'folder'))).toBe(true);
  });

  test('a regular file is still read, stat-ed and removed', async () => {
    const { helper, bucket, root } = build();
    const object = { key: 'real.txt' };

    const result5 = await helper.getStat({ bucket, object });
    expect(result5.size).toBe(7);
    const result6 = await refusal(helper.getObject({ bucket, object }));
    expect(result6).toBe('');

    await helper.removeObject({ bucket, object });

    expect(existsSync(join(root, 'docs', 'real.txt'))).toBe(false);
  });
});
