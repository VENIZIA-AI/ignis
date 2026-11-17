import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskHelper } from '@/modules/storage/disk';

/** A refusal or a failure of the disk helper never carries an absolute path of the server: the caller of a storage API may be a client. */
const roots: string[] = [];

const build = () => {
  const base = mkdtempSync(join(tmpdir(), 'disk-error-paths-'));
  roots.push(base);

  const root = join(base, 'root');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'real.txt'), 'inside');

  return { base, root, helper: new DiskHelper({ basePath: root }), bucket: { name: 'docs' } };
};

const refusal = async (task: Promise<unknown>): Promise<Error> => {
  try {
    await task;
  } catch (error) {
    return error as Error;
  }

  throw new Error('expected the task to fail');
};

afterEach(() => {
  for (const base of roots.splice(0)) {
    const locked = join(base, 'root', 'docs', 'locked');

    if (existsSync(locked)) {
      chmodSync(locked, 0o755);
    }

    rmSync(base, { recursive: true, force: true });
  }
});

describe('DiskHelper - error messages hold no absolute path', () => {
  test('a link loop is an invalid object name, not a raw ELOOP', async () => {
    const { base, root, helper, bucket } = build();
    symlinkSync(join(root, 'docs', 'loop-b'), join(root, 'docs', 'loop-a'));
    symlinkSync(join(root, 'docs', 'loop-a'), join(root, 'docs', 'loop-b'));

    const error = await refusal(helper.getObject({ bucket, object: { key: 'loop-a' } }));

    expect(error.message).toContain('Invalid object name');
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect(error.message).not.toContain(base);
    expect(error.message).not.toContain('ELOOP');
  });

  test('a directory the process cannot search is a failure that names the code, not the path', async () => {
    const { base, root, helper, bucket } = build();
    mkdirSync(join(root, 'docs', 'locked'));
    writeFileSync(join(root, 'docs', 'locked', 'a.txt'), 'x');
    chmodSync(join(root, 'docs', 'locked'), 0o000);

    const error = await refusal(helper.getObject({ bucket, object: { key: 'locked/a.txt' } }));

    expect(error.message).toContain('EACCES');
    expect((error as { statusCode?: number }).statusCode).toBe(500);
    expect(error.message).not.toContain(base);
    expect(error.message).not.toContain('locked');
  });

  test('a storage root that disappeared is a failure that names the code, not the path', async () => {
    const { base, root, helper, bucket } = build();
    rmSync(root, { recursive: true, force: true });

    const error = await refusal(helper.getObject({ bucket, object: { key: 'real.txt' } }));

    expect(error.message).toContain('ENOENT');
    expect((error as { statusCode?: number }).statusCode).toBe(500);
    expect(error.message).not.toContain(base);
  });
});
