import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every framework package keeps the same root: nothing missing, nothing extra. */

const ROOT = join(import.meta.dir, '..', '..', '..');
const PACKAGES = readdirSync(join(ROOT, 'packages')).sort();
const REQUIRED = [
  '.configs',
  'LICENSE.md',
  'Makefile',
  'README.md',
  'package.json',
  'src',
  'tsconfig.json',
];
const FILES = ['README.md', 'LICENSE.md', 'dist', '!**/__tests__', '!**/*.tsbuildinfo'];

const trackedRootOf = (opts: { name: string }): string[] => {
  const listed = Bun.spawnSync(['git', 'ls-files', `packages/${opts.name}`], {
    cwd: ROOT,
  }).stdout.toString();
  const prefix = `packages/${opts.name}/`;

  return [
    ...new Set(
      listed
        .trim()
        .split('\n')
        .map(path => path.slice(prefix.length).split('/')[0]),
    ),
  ].sort();
};

describe('package layout', () => {
  test.each(PACKAGES)('%s tracks exactly the shared root entries', name => {
    expect(trackedRootOf({ name })).toEqual(REQUIRED);
  });

  test.each(PACKAGES)('%s publishes the shared files list', async name => {
    const manifest = await Bun.file(join(ROOT, 'packages', name, 'package.json')).json();
    // dev-configs also ships its tsconfig bases, which consumers extend.
    const expected =
      name === 'dev-configs' ? [...FILES.slice(0, 3), 'src/tsconfig', ...FILES.slice(3)] : FILES;

    expect(manifest.files).toEqual(expected);
  });

  test.each(PACKAGES)('%s runs force-update from the shared root script', async name => {
    const manifest = await Bun.file(join(ROOT, 'packages', name, 'package.json')).json();

    expect(manifest.scripts['force-update']).toBe('sh ../../scripts/build/force-update.sh');
  });
});
