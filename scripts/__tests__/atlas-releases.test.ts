import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtlasReleases, RELEASES_OUTPUT } from '../atlas-releases';

const tmpDirs: string[] = [];

const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ignis-atlas-releases-'));
  tmpDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const withFrontmatter = (opts: { frontmatter: string; body: string }): string =>
  `---\n${opts.frontmatter}\n---\n\n${opts.body}\n`;

describe('AtlasReleases.parseReleaseSubject', () => {
  test('reads the package and the version out of a prerelease subject', () => {
    expect(
      AtlasReleases.parseReleaseSubject({
        subject: 'chore(kernel): release v0.2.0-21 [prerelease]',
      }),
    ).toEqual({ package: 'kernel', version: '0.2.0-21' });
  });

  test('reads a hyphenated package name and a patch mode', () => {
    expect(
      AtlasReleases.parseReleaseSubject({ subject: 'chore(core-server): release v0.1.5 [patch]' }),
    ).toEqual({ package: 'core-server', version: '0.1.5' });
  });

  test('ignores a subject that is not a release commit', () => {
    expect(
      AtlasReleases.parseReleaseSubject({ subject: 'feat(atlas): the symbol tool' }),
    ).toBeUndefined();
  });

  test('ignores a release-shaped subject with no scope', () => {
    expect(
      AtlasReleases.parseReleaseSubject({ subject: 'chore: release v0.2.0-21 [prerelease]' }),
    ).toBeUndefined();
  });
});

describe('AtlasReleases.packagesOf', () => {
  test('a packages frontmatter list wins over everything else in the file', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change\npackages:\n  - kernel\n  - boot',
      body: '| Symbol | Change | Package |\n|---|---|---|\n| `x` | New | helpers |\n',
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual(['boot', 'kernel']);
  });

  test('a Details table Package column names the packages, de-duplicated and sorted', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: [
        '| Symbol | Change | Package |',
        '|---|---|---|',
        '| `a` | New | kernel |',
        '| `b` | New | core-server |',
        '| `c` | New | kernel |',
      ].join('\n'),
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual(['core-server', 'kernel']);
  });

  test('a Package column cell spelt as a scoped npm name maps back to its directory', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: [
        '| Symbol | Change | Package |',
        '|---|---|---|',
        '| `a` | New | `@venizia/ignis` |',
        '| `b` | New | `@venizia/ignis-worker` |',
      ].join('\n'),
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual(['core-server', 'core-worker']);
  });

  test('a Package column cell that names no package at all is dropped, not guessed', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: [
        '| Symbol | Change | Package |',
        '|---|---|---|',
        '| `a` | New | Makefile |',
        '| `b` | New | `.agents/knowledge/reference` |',
      ].join('\n'),
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual([]);
  });

  test('a table wins over a body mention - the first rule that hits is the answer', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: [
        'Import it from `@venizia/ignis-helpers`.',
        '',
        '| Symbol | Change | Package |',
        '|---|---|---|',
        '| `a` | New | kernel |',
      ].join('\n'),
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual(['kernel']);
  });

  test('body mentions map @venizia/ignis to core-server and the worker to core-worker', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: 'Both `@venizia/ignis` and `@venizia/ignis-worker` changed, plus `@venizia/ignis-helpers/core`.',
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual(['core-server', 'core-worker', 'helpers']);
  });

  test('a file that names no package resolves to none', () => {
    const text = withFrontmatter({
      frontmatter: 'title: A change',
      body: 'Prose with no package name and no details table.',
    });

    expect(AtlasReleases.packagesOf({ text })).toEqual([]);
  });
});

describe('AtlasReleases.kindOf', () => {
  test('reads the first badge text', () => {
    const text = '# Changelog\n\n<Badge type="tip" text="New Feature" />\n';

    expect(AtlasReleases.kindOf({ text })).toBe('New Feature');
  });

  test('a file with no badge has no kind', () => {
    expect(AtlasReleases.kindOf({ text: '# Changelog\n\nProse.\n' })).toBeNull();
  });
});

describe('AtlasReleases.titleOf', () => {
  test('reads the frontmatter title', () => {
    const text = withFrontmatter({ frontmatter: 'title: A Real Title', body: '# Changelog' });

    expect(AtlasReleases.titleOf({ text, file: '2026-01-01-thing.md' })).toBe('A Real Title');
  });

  test('falls back to the file stem rather than an empty title', () => {
    expect(AtlasReleases.titleOf({ text: '# Changelog\n', file: '2026-01-01-thing.md' })).toBe(
      '2026-01-01-thing',
    );
  });
});

const hasGeneratedTable = existsSync(RELEASES_OUTPUT);

describe.skipIf(!hasGeneratedTable)('AtlasReleases.check', () => {
  test('reads fresh against the committed table', () => {
    expect(AtlasReleases.check(), 'stale release table - run `make releases-gen`').toBe(true);
  });

  test('reads stale once a release is dropped from the table', () => {
    const outputPath = join(makeTmpDir(), 'releases.json');
    writeFileSync(outputPath, AtlasReleases.render());
    expect(AtlasReleases.check({ outputPath })).toBe(true);

    const table = JSON.parse(readFileSync(outputPath, 'utf8'));
    const packageName = Object.keys(table.releases)[0];
    table.releases[packageName] = table.releases[packageName].slice(1);
    writeFileSync(outputPath, `${JSON.stringify(table, null, 2)}\n`);

    expect(AtlasReleases.check({ outputPath })).toBe(false);
  });
});
