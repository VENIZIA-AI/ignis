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
      '--plan',
      'kernel@0.4.5,connectors@0.4.5',
      '--issue',
      '80',
    ]);

    expect(parsed.named).toEqual(['kernel']);
    expect(parsed.plan).toBe('kernel@0.4.5,connectors@0.4.5');
  });

  test('defaults: prerelease, no issue, nothing named', () => {
    expect(parseReleaseArgs([])).toEqual({
      isDryRun: false,
      isConfirmed: false,
      mode: 'prerelease',
      plan: undefined,
      issue: undefined,
      named: [],
    });
  });

  test('the boolean flags are read', () => {
    const parsed = parseReleaseArgs(['--dry-run', '--yes']);

    expect([parsed.isDryRun, parsed.isConfirmed]).toEqual([true, true]);
  });

  test('--chain-released is gone: one run needs no list of what an earlier run published', () => {
    expect(parseReleaseArgs(['--chain-released', 'dev-configs']).named).toEqual(['dev-configs']);
  });

  test('an --issue that is not a number throws', () => {
    expect(() => parseReleaseArgs(['--issue', 'abc'])).toThrow('--issue needs an issue number');
  });
});
