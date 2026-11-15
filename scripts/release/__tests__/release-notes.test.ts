import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReleaseNotes } from '../release-notes';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const CHANGELOGS = join(ROOT, 'docs/wiki/content/changelogs');

describe('ReleaseNotes.bodyOf', () => {
  test('is the log without its front matter and without the blank lines around it', () => {
    expect(
      ReleaseNotes.bodyOf({ log: '---\ntitle: 0.4.9\n---\n\nThe line.\n\n## Breaking\n- x\n\n' }),
    ).toBe('The line.\n\n## Breaking\n- x');
  });

  test('is empty when nothing but front matter is there, and keeps a log with no front matter whole', () => {
    expect(ReleaseNotes.bodyOf({ log: '---\ntitle: 0.4.9\n---\n' })).toBe('');
    expect(ReleaseNotes.bodyOf({ log: 'Plain.\n' })).toBe('Plain.');
  });
});

describe('ReleaseNotes.hasBlocks', () => {
  test('an absent file, an empty one, a comment and {} hold no block', () => {
    expect(ReleaseNotes.hasBlocks({})).toBe(false);
    expect(ReleaseNotes.hasBlocks({ migration: '' })).toBe(false);
    expect(ReleaseNotes.hasBlocks({ migration: '  \n' })).toBe(false);
    expect(ReleaseNotes.hasBlocks({ migration: '# none\n' })).toBe(false);
    expect(ReleaseNotes.hasBlocks({ migration: '{}\n' })).toBe(false);
  });

  test('a file with a block holds one, and a file that does not parse still ships', () => {
    expect(ReleaseNotes.hasBlocks({ migration: 'a-change:\n  symbols: [x]\n' })).toBe(true);
    expect(ReleaseNotes.hasBlocks({ migration: 'a: [unclosed\n' })).toBe(true);
  });
});

/** `vulcan changelog notes`, the command VULCAN runs over the same two files: this copy must agree with it. */
const command = (opts: { args: string[] }): string => {
  const child = Bun.spawnSync(
    ['bun', 'x', '--no-install', 'vulcan', 'changelog', 'notes', ...opts.args],
    {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  if (child.exitCode !== 0) {
    throw new Error(`vulcan changelog notes ${opts.args.join(' ')}: ${child.stderr.toString()}`);
  }

  return child.stdout.toString();
};

describe('ReleaseNotes against `vulcan changelog notes`, on every version folder of this repository', () => {
  const versions = readdirSync(CHANGELOGS).filter((name) => /^\d+\.\d+\.\d+$/.test(name));

  test('there are folders to compare', () => {
    expect(versions.length).toBeGreaterThan(0);
  });

  for (const version of versions) {
    test(`${version}: the body is the one the command prints, and the migration is attached when the command says so`, () => {
      const log = readFileSync(join(CHANGELOGS, version, 'log.md'), 'utf8');
      const migrationFile = join(CHANGELOGS, version, 'migration.yaml');
      const migration = existsSync(migrationFile) ? readFileSync(migrationFile, 'utf8') : undefined;
      const printed = command({ args: ['--version', version] });
      const body = printed.slice(0, printed.lastIndexOf('\n\n## Packages\n'));

      expect(body).toBe(
        ReleaseNotes.bodyOf({ log }) === ''
          ? 'No change for users of the packages in this release.'
          : ReleaseNotes.bodyOf({ log }),
      );
      expect(command({ args: ['--version', version, '--migration'] }).trim() !== '').toBe(
        ReleaseNotes.hasBlocks({ migration }),
      );
    });
  }
});
