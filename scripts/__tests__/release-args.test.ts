import { describe, expect, test } from 'bun:test';
import { parseReleaseArgs } from '../release-args';

describe('parseReleaseArgs', () => {
  test('a package name given first is kept', () => {
    expect(parseReleaseArgs(['kernel']).named).toEqual(['kernel']);
  });

  test('a package name after the flags is kept', () => {
    const parsed = parseReleaseArgs(['--mode', 'prerelease', '--issue', '168', 'dev-configs']);

    expect(parsed.named).toEqual(['dev-configs']);
    expect(parsed.mode).toBe('prerelease');
    expect(parsed.issue).toBe('168');
  });

  test('flag values are never package names', () => {
    const parsed = parseReleaseArgs([
      'kernel',
      '--mode',
      'patch',
      '--chain-released',
      'dev-configs,inversion',
      '--issue',
      '80',
    ]);

    expect(parsed.named).toEqual(['kernel']);
    expect(parsed.seeded).toEqual(['dev-configs', 'inversion']);
  });

  test('defaults: prerelease, no issue, nothing named', () => {
    expect(parseReleaseArgs([])).toEqual({
      isDryRun: false,
      isConfirmed: false,
      skipAtlas: false,
      mode: 'prerelease',
      seeded: [],
      issue: undefined,
      named: [],
    });
  });

  test('the boolean flags are read', () => {
    const parsed = parseReleaseArgs(['--dry-run', '--yes', '--no-atlas']);

    expect([parsed.isDryRun, parsed.isConfirmed, parsed.skipAtlas]).toEqual([true, true, true]);
  });

  test('an --issue that is not a number throws', () => {
    expect(() => parseReleaseArgs(['--issue', 'abc'])).toThrow('--issue needs an issue number');
  });
});
