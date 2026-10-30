import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TReleaseMode } from '../release-constants';
import { ReleaseDispatch } from '../release-dispatch';

const ENTRIES = [
  { name: 'helpers', from: '0.4.5' },
  { name: 'kernel', from: '0.4.5' },
  { name: 'connectors', from: '0.4.5' },
];

describe('ReleaseDispatch.buildArgs', () => {
  test('is one workflow run with the whole plan in one input', () => {
    expect(ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'patch', issue: '638' })).toEqual([
      'workflow',
      'run',
      'package-release.yml',
      '--ref',
      'main',
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
    const refOf = (mode: TReleaseMode) => {
      const args = ReleaseDispatch.buildArgs({ entries: ENTRIES, mode });
      return args[args.indexOf('--ref') + 1];
    };

    expect(refOf('prerelease')).toBe('develop');
    expect(refOf('prepatch')).toBe('develop');
    expect(refOf('patch')).toBe('main');
    expect(refOf('minor')).toBe('main');
    expect(refOf('major')).toBe('main');
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

describe('ReleaseDispatch.buildArgs: the run title', () => {
  test('sends the label as the label input, last', () => {
    const label = 'stable · 0.4.6 helpers,kernel · #664 · c84852a';
    const args = ReleaseDispatch.buildArgs({
      entries: ENTRIES,
      mode: 'patch',
      issue: '664',
      label,
    });

    expect(args.slice(-2)).toEqual(['-f', `label=${label}`]);
  });

  test('sends none when the label is empty or absent', () => {
    for (const label of [undefined, '']) {
      const args = ReleaseDispatch.buildArgs({ entries: ENTRIES, mode: 'patch', label });

      expect(args.some((arg) => arg.startsWith('label='))).toBe(false);
    }
  });
});

describe('ReleaseDispatch.declaresLabel', () => {
  test('is true for a workflow that declares the label input', () => {
    const workflowText = `on:\n  workflow_dispatch:\n    inputs:\n      plan:\n        type: string\n      label:\n        type: string\n`;

    expect(ReleaseDispatch.declaresLabel({ workflowText })).toBe(true);
  });

  test('is false for a workflow without it, without inputs, with another trigger or that is not YAML', () => {
    const without = `on:\n  workflow_dispatch:\n    inputs:\n      plan:\n        type: string\n`;
    const noInputs = `on:\n  workflow_dispatch:\n`;
    const push = `on:\n  push:\n    branches: [main]\n`;

    for (const workflowText of [without, noInputs, push, '', '{ not: [yaml']) {
      expect(ReleaseDispatch.declaresLabel({ workflowText })).toBe(false);
    }
  });

  test('is true for the committed release workflow', () => {
    const workflowText = readFileSync(
      resolve(import.meta.dir, '..', '..', '..', '.github/workflows/package-release.yml'),
      'utf8',
    );

    expect(ReleaseDispatch.declaresLabel({ workflowText })).toBe(true);
  });
});
