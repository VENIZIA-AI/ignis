import { describe, expect, test } from 'bun:test';
import { ReleaseArgs } from '../release-args';

describe('ReleaseArgs.parse', () => {
  test('a package name given first is kept', () => {
    expect(ReleaseArgs.parse({ args: ['kernel'] }).named).toEqual(['kernel']);
  });

  test('a package name after the flags is kept', () => {
    const parsed = ReleaseArgs.parse({
      args: ['--mode', 'prerelease', '--issue', '168', 'dev-configs'],
    });

    expect(parsed.named).toEqual(['dev-configs']);
    expect(parsed.mode).toBe('prerelease');
    expect(parsed.issue).toBe('168');
  });

  test('flag values are never package names', () => {
    const parsed = ReleaseArgs.parse({
      args: [
        'kernel',
        '--mode',
        'patch',
        '--plan',
        'kernel@0.4.5,connectors@0.4.5',
        '--issue',
        '80',
      ],
    });

    expect(parsed.named).toEqual(['kernel']);
    expect(parsed.plan).toBe('kernel@0.4.5,connectors@0.4.5');
  });

  test('defaults: prerelease, no issue, nothing named', () => {
    expect(ReleaseArgs.parse({ args: [] })).toEqual({
      isDryRun: false,
      isConfirmed: false,
      mode: 'prerelease',
      plan: undefined,
      issue: undefined,
      named: [],
    });
  });

  test('the boolean flags are read', () => {
    const parsed = ReleaseArgs.parse({ args: ['--dry-run', '--yes'] });

    expect([parsed.isDryRun, parsed.isConfirmed]).toEqual([true, true]);
  });

  test('--chain-released is gone: one run needs no list of what an earlier run published', () => {
    expect(ReleaseArgs.parse({ args: ['--chain-released', 'dev-configs'] }).named).toEqual([
      'dev-configs',
    ]);
  });

  test('an --issue that is not a number throws', () => {
    expect(() => ReleaseArgs.parse({ args: ['--issue', 'abc'] })).toThrow(
      '--issue needs an issue number',
    );
  });
});
