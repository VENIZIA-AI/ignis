import { describe, expect, test } from 'bun:test';
import type { TReleaseMode } from '../release-constants';
import { ReleaseVersion } from '../release-version';

const next = (from: string, mode: TReleaseMode) => ReleaseVersion.next({ from, mode });

describe('ReleaseVersion.next (what npm version <mode> gives)', () => {
  test('a stable bump from a stable version', () => {
    expect(next('0.4.5', 'patch')).toBe('0.4.6');
    expect(next('0.4.5', 'minor')).toBe('0.5.0');
    expect(next('0.4.5', 'major')).toBe('1.0.0');
  });

  test('a stable bump from a prerelease drops the prerelease when the core is already the next one', () => {
    expect(next('0.4.9-3', 'patch')).toBe('0.4.9');
    expect(next('0.5.0-2', 'minor')).toBe('0.5.0');
    expect(next('1.0.0-2', 'major')).toBe('1.0.0');
  });

  test('a stable bump from a prerelease of a patch still moves the minor or the major', () => {
    expect(next('0.4.9-0', 'minor')).toBe('0.5.0');
    expect(next('0.5.1-0', 'major')).toBe('1.0.0');
  });

  test('the pre modes start a prerelease at 0', () => {
    expect(next('0.4.5', 'prepatch')).toBe('0.4.6-0');
    expect(next('0.4.5', 'preminor')).toBe('0.5.0-0');
    expect(next('0.4.5', 'premajor')).toBe('1.0.0-0');
  });

  test('prerelease raises the counter, or starts the next patch as a prerelease', () => {
    expect(next('0.4.9-0', 'prerelease')).toBe('0.4.9-1');
    expect(next('0.4.9-9', 'prerelease')).toBe('0.4.9-10');
    expect(next('0.4.5', 'prerelease')).toBe('0.4.6-0');
  });

  test('a named prerelease: the last number is raised, a name alone gets a counter', () => {
    expect(next('0.4.9-rc.1', 'prerelease')).toBe('0.4.9-rc.2');
    expect(next('0.4.9-rc', 'prerelease')).toBe('0.4.9-rc.0');
  });

  test('refuses a version it cannot read and a mode npm does not have', () => {
    expect(() => next('0.4', 'patch')).toThrow(/not a semver/);
    expect(() => next('0.4.5', 'sideways' as TReleaseMode)).toThrow(/not an npm version mode/);
  });
});
