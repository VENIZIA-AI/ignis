import { describe, expect, test } from 'bun:test';
import { NextTagSync } from '../sync-next-tag';

describe('NextTagSync.decide', () => {
  test('a next below latest on another minor moves', () => {
    expect(NextTagSync.decide({ latest: '0.3.0', next: '0.2.2-19' }).move).toBe(true);
  });

  test('a prerelease of the latest version itself is below it and moves', () => {
    expect(NextTagSync.decide({ latest: '0.3.1', next: '0.3.1-4' }).move).toBe(true);
  });

  test('a prerelease of a newer version is kept', () => {
    expect(NextTagSync.decide({ latest: '0.3.1', next: '0.3.2-0' }).move).toBe(false);
  });

  test('a stable that is below a newer prerelease keeps that next (0.4.9 against 0.4.10-0)', () => {
    expect(NextTagSync.decide({ latest: '0.4.9', next: '0.4.10-0' }).move).toBe(false);
  });

  test('a stable that overtakes the prerelease it came from moves next to itself (0.4.9 over 0.4.9-3)', () => {
    expect(NextTagSync.decide({ latest: '0.4.9', next: '0.4.9-3' }).move).toBe(true);
  });

  test('equal versions are kept', () => {
    expect(NextTagSync.decide({ latest: '0.3.1', next: '0.3.1' }).move).toBe(false);
  });

  test('a missing next moves', () => {
    expect(NextTagSync.decide({ latest: '0.3.0' }).move).toBe(true);
  });

  test('a missing latest is kept, there is nothing to compare', () => {
    expect(NextTagSync.decide({ next: '0.3.0-1' }).move).toBe(false);
    expect(NextTagSync.decide({}).move).toBe(false);
  });
});

describe('Bun.semver.order', () => {
  test('orders prereleases the way the rule needs', () => {
    expect(Bun.semver.order('0.2.2-19', '0.3.0')).toBe(-1);
    expect(Bun.semver.order('0.3.1-4', '0.3.1')).toBe(-1);
    expect(Bun.semver.order('0.3.2-0', '0.3.1')).toBe(1);
    expect(Bun.semver.order('0.3.1-10', '0.3.1-9')).toBe(1);
    expect(Bun.semver.order('0.3.1', '0.3.1')).toBe(0);
  });
});

describe('NextTagSync.parsePublished', () => {
  test('reads a scoped name, a version and a tag', () => {
    expect(
      NextTagSync.parsePublished({
        args: ['--published', '@venizia/ignis@0.3.1', '--tag', 'latest'],
      }),
    ).toEqual({
      name: '@venizia/ignis',
      version: '0.3.1',
      tag: 'latest',
    });
  });

  test('no --published means the registry is trusted', () => {
    expect(NextTagSync.parsePublished({ args: ['--dry-run'] })).toBeUndefined();
  });

  test('a malformed value or an unknown tag throws', () => {
    expect(() =>
      NextTagSync.parsePublished({ args: ['--published', 'ignis', '--tag', 'latest'] }),
    ).toThrow();
    expect(() =>
      NextTagSync.parsePublished({ args: ['--published', 'a@1.0.0', '--tag', 'highest'] }),
    ).toThrow();
    expect(() => NextTagSync.parsePublished({ args: ['--published', 'a@1.0.0'] })).toThrow();
  });
});

describe('NextTagSync.applyPublished', () => {
  const published = { name: '@venizia/ignis', version: '0.3.1', tag: 'latest' as const };

  test('the just-published version replaces a stale registry value for that tag', () => {
    const tags = NextTagSync.applyPublished({
      name: '@venizia/ignis',
      tags: { latest: '0.3.0', next: '0.3.0' },
      published,
    });

    expect(tags).toEqual({ latest: '0.3.1', next: '0.3.0' });
    expect(NextTagSync.decide(tags).move).toBe(true);
  });

  test('a stale registry that lacks the tag entirely still gets it', () => {
    expect(NextTagSync.applyPublished({ name: '@venizia/ignis', tags: {}, published }).latest).toBe(
      '0.3.1',
    );
  });

  test('another package keeps what the registry reports', () => {
    const tags = { latest: '0.3.0', next: '0.2.2-1' };

    expect(NextTagSync.applyPublished({ name: '@venizia/ignis-kernel', tags, published })).toEqual(
      tags,
    );
  });

  test('no published package leaves the registry value untouched', () => {
    const tags = { latest: '0.3.0' };

    expect(NextTagSync.applyPublished({ name: '@venizia/ignis', tags })).toEqual(tags);
  });

  test('a published next overrides next only', () => {
    const tags = NextTagSync.applyPublished({
      name: '@venizia/ignis',
      tags: { latest: '0.3.0', next: '0.2.2-1' },
      published: { name: '@venizia/ignis', version: '0.3.1-0', tag: 'next' },
    });

    expect(tags).toEqual({ latest: '0.3.0', next: '0.3.1-0' });
    expect(NextTagSync.decide(tags).move).toBe(false);
  });
});
