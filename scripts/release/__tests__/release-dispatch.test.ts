import { describe, expect, test } from 'bun:test';
import { ReleaseDispatch } from '../release-dispatch';

const ENTRIES = [
  { name: 'helpers', from: '0.4.5' },
  { name: 'kernel', from: '0.4.5' },
  { name: 'connectors', from: '0.4.5' },
];

describe('ReleaseDispatch.buildArgs', () => {
  test('is one workflow run on develop with the whole plan in one input', () => {
    expect(ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'patch', issue: '638' })).toEqual([
      'workflow',
      'run',
      'package-release.yml',
      '--ref',
      'develop',
      '-f',
      'plan=helpers@0.4.5,kernel@0.4.5,connectors@0.4.5',
      '-f',
      'build_mode=patch',
      '-f',
      'issue=638',
    ]);
  });

  test('leaves the issue out when none is given', () => {
    const args = ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'prerelease' });

    expect(args.some((arg) => arg.startsWith('issue='))).toBe(false);
  });

  test('names no input of the old one-package-per-run workflow', () => {
    const text = ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'patch' }).join(' ');

    expect(text).not.toMatch(/package=|dependencies_from|chain_released/);
  });

  test('always names its ref, so a default branch other than develop changes nothing', () => {
    const args = ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'patch' });

    expect(args[args.indexOf('--ref') + 1]).toBe('develop');
  });
});

describe('ReleaseDispatch.planFlag', () => {
  test('prints the plan as a value --plan takes back', () => {
    expect(ReleaseDispatch.planFlag({ entries: ENTRIES })).toBe(
      '--plan helpers@0.4.5,kernel@0.4.5,connectors@0.4.5',
    );
  });
});

describe('ReleaseDispatch.readOutcomes', () => {
  const log = [
    'plan\tPlan\t2026-10-29T10:00:00.0000000Z some other line',
    'publish\tRelease\t2026-10-29T10:01:00.0000000Z = @venizia/ignis-helpers@0.4.6',
    'publish\tRelease\t2026-10-29T10:02:00.0000000Z + @venizia/ignis-kernel@0.4.6',
    'publish\tRelease\t2026-10-29T10:03:00.0000000Z + @venizia/ignis-connectors@0.4.6',
  ].join('\n');

  test('reads a + line (published now) and a = line (already released) for each package', () => {
    const outcomes = ReleaseDispatch.readOutcomes({
      log,
      packageNames: [
        '@venizia/ignis-helpers',
        '@venizia/ignis-kernel',
        '@venizia/ignis-connectors',
      ],
    });

    expect(outcomes.get('@venizia/ignis-helpers')).toEqual({ marker: '=', version: '0.4.6' });
    expect(outcomes.get('@venizia/ignis-kernel')).toEqual({ marker: '+', version: '0.4.6' });
    expect(outcomes.get('@venizia/ignis-connectors')).toEqual({ marker: '+', version: '0.4.6' });
  });

  test('a package with neither marker is absent, so the caller can refuse the run', () => {
    const outcomes = ReleaseDispatch.readOutcomes({
      log,
      packageNames: ['@venizia/ignis-boot'],
    });

    expect(outcomes.has('@venizia/ignis-boot')).toBe(false);
  });

  test('a name that is the prefix of another is not mistaken for it', () => {
    const outcomes = ReleaseDispatch.readOutcomes({
      log: '+ @venizia/ignis-kernel@0.4.6',
      packageNames: ['@venizia/ignis'],
    });

    expect(outcomes.has('@venizia/ignis')).toBe(false);
  });

  test('a prerelease version is read whole', () => {
    const outcomes = ReleaseDispatch.readOutcomes({
      log: 'x 2026Z + @venizia/ignis@0.4.9-1',
      packageNames: ['@venizia/ignis'],
    });

    expect(outcomes.get('@venizia/ignis')).toEqual({ marker: '+', version: '0.4.9-1' });
  });
});
