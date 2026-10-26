import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CleanCommand } from '../cli/clean';

const touch = (opts: { root: string; path: string }) => {
  const target = join(opts.root, opts.path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, '');
};

describe('devz clean', () => {
  let root: string;

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'clean-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('removes dist and the node_modules cache', () => {
    touch({ root, path: 'dist/index.js' });
    touch({ root, path: 'node_modules/.cache/eslint/x' });
    touch({ root, path: 'node_modules/pkg/index.js' });

    expect(CleanCommand.run({ root })).toBe(0);

    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(existsSync(join(root, 'node_modules/.cache'))).toBe(false);
    expect(existsSync(join(root, 'node_modules/pkg/index.js'))).toBe(true);
  });

  test('removes top-level *.tsbuildinfo files, whatever the tsconfig is called', () => {
    touch({ root, path: 'tsconfig.tsbuildinfo' });
    touch({ root, path: 'tsconfig.build.tsbuildinfo' });

    CleanCommand.run({ root });

    expect(existsSync(join(root, 'tsconfig.tsbuildinfo'))).toBe(false);
    expect(existsSync(join(root, 'tsconfig.build.tsbuildinfo'))).toBe(false);
  });

  test('--help and -h print the usage, exit 0 and delete nothing', () => {
    touch({ root, path: 'dist/index.js' });
    touch({ root, path: 'tsconfig.tsbuildinfo' });
    const logs: string[] = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    for (const flag of ['--help', '-h']) {
      expect(CleanCommand.run({ root, args: [flag] })).toBe(0);
    }

    expect(logs.join('\n')).toContain('Usage: devz clean');
    expect(existsSync(join(root, 'dist/index.js'))).toBe(true);
    expect(existsSync(join(root, 'tsconfig.tsbuildinfo'))).toBe(true);
  });

  test('an unknown flag or argument exits 2 and deletes nothing', () => {
    touch({ root, path: 'dist/index.js' });
    touch({ root, path: 'tsconfig.tsbuildinfo' });
    spyOn(console, 'error').mockImplementation(() => {});

    for (const args of [['--halp'], ['dist'], ['--force', '--help-me']]) {
      expect(CleanCommand.run({ root, args })).toBe(2);
    }

    expect(existsSync(join(root, 'dist/index.js'))).toBe(true);
    expect(existsSync(join(root, 'tsconfig.tsbuildinfo'))).toBe(true);
  });

  test('leaves source, config and a nested tsbuildinfo alone', () => {
    touch({ root, path: 'src/index.ts' });
    touch({ root, path: 'tsconfig.json' });
    touch({ root, path: 'src/tsconfig.tsbuildinfo' });
    touch({ root, path: '.eslintcache' });

    CleanCommand.run({ root });

    expect(existsSync(join(root, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(root, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(root, 'src/tsconfig.tsbuildinfo'))).toBe(true);
    expect(existsSync(join(root, '.eslintcache'))).toBe(true);
  });

  test('is a no-op on an already clean root', () => {
    expect(CleanCommand.run({ root })).toBe(0);
  });
});
