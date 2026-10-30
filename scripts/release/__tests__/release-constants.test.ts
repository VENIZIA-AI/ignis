import { describe, expect, test } from 'bun:test';
import { ReleaseArgs } from '../release-args';
import { NpmDistTags, ReleaseModes } from '../release-constants';
import { NextTagSync } from '../sync-next-tag';

describe('release constants', () => {
  test('ReleaseModes holds the seven npm version modes and validates them', () => {
    expect([...ReleaseModes.SCHEME_SET]).toEqual([
      'patch',
      'minor',
      'major',
      'prepatch',
      'preminor',
      'premajor',
      'prerelease',
    ]);
    expect([...ReleaseModes.STABLE_SET]).toEqual(['patch', 'minor', 'major']);
    expect(ReleaseModes.isValid('premajor')).toBe(true);
    expect(ReleaseModes.isValid('latest')).toBe(false);
  });

  test('NpmDistTags holds latest and next', () => {
    expect([...NpmDistTags.SCHEME_SET]).toEqual(['latest', 'next']);
    expect(NpmDistTags.isValid('next')).toBe(true);
    expect(NpmDistTags.isValid('beta')).toBe(false);
  });

  test('--mode accepts a valid mode and refuses an unknown one with the valid list', () => {
    expect(ReleaseArgs.parse({ args: ['--mode', 'patch'] }).mode).toBe('patch');
    expect(ReleaseArgs.parse({ args: [] }).mode).toBe('prerelease');
    expect(() => ReleaseArgs.parse({ args: ['--mode', 'pach'] })).toThrow(
      /--mode must be one of patch, minor/,
    );
    expect(() => ReleaseArgs.parse({ args: ['--mode'] })).toThrow(/got: nothing/);
  });

  test('--tag is still validated by NpmDistTags', () => {
    expect(
      NextTagSync.parsePublished({
        args: ['--published', '@venizia/ignis@0.4.2', '--tag', 'next'],
      })?.tag,
    ).toBe('next');
    expect(() =>
      NextTagSync.parsePublished({
        args: ['--published', '@venizia/ignis@0.4.2', '--tag', 'beta'],
      }),
    ).toThrow(/--tag must be latest or next/);
  });
});
