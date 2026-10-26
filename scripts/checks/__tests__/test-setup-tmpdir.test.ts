import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRELOAD = resolve(import.meta.dir, '../../test-setup/tmpdir.ts');
const REPOSITORY_ROOT = resolve(import.meta.dir, '../../..');

describe('the test preload', () => {
  test('moves os.tmpdir() into the repository for a bare run with no TMPDIR', () => {
    const env = { ...process.env };
    delete env.TMPDIR;
    delete env.NODE_COMPILE_CACHE;

    const run = Bun.spawnSync(
      [
        process.execPath,
        '--preload',
        PRELOAD,
        '-e',
        'console.log(require("node:os").tmpdir() + "|" + process.env.NODE_COMPILE_CACHE)',
      ],
      { env },
    );
    const [folder, cache] = run.stdout.toString().trim().split('|');

    expect(folder).toBe(join(REPOSITORY_ROOT, '.agents/local/tmp'));
    expect(cache).toBe(join(REPOSITORY_ROOT, '.agents/local/cache/node-compile'));
  });

  test('is wired in: this very run already has its temp folder inside the repository', () => {
    expect(tmpdir().startsWith(REPOSITORY_ROOT)).toBe(true);
  });
});
