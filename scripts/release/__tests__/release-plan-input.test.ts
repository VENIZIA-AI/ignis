import { describe, expect, test } from 'bun:test';
import { ReleaseOrder } from '../release-constants';
import { ReleasePlanInput } from '../release-plan-input';

describe('ReleaseOrder', () => {
  test('lists the nine packages in dependency order', () => {
    expect([...ReleaseOrder.NAMES]).toEqual([
      'dev-configs',
      'inversion',
      'filter',
      'helpers',
      'boot',
      'kernel',
      'connectors',
      'core-worker',
      'core-server',
    ]);
  });

  test('sorts any subset into that order and knows its own names', () => {
    expect(ReleaseOrder.sort({ names: ['core-server', 'helpers', 'kernel'] })).toEqual([
      'helpers',
      'kernel',
      'core-server',
    ]);
    expect(ReleaseOrder.isKnown('kernel')).toBe(true);
    expect(ReleaseOrder.isKnown('docs')).toBe(false);
  });
});

describe('ReleasePlanInput', () => {
  test('parses name@from entries and returns them in dependency order, whatever order they came in', () => {
    const entries = ReleasePlanInput.parse({
      text: 'kernel@0.4.5, helpers@0.4.5,core-server@0.4.5',
    });

    expect(entries).toEqual([
      { name: 'helpers', from: '0.4.5' },
      { name: 'kernel', from: '0.4.5' },
      { name: 'core-server', from: '0.4.5' },
    ]);
  });

  test('accepts a prerelease version as the starting point', () => {
    expect(ReleasePlanInput.parse({ text: 'kernel@0.4.9-1' })).toEqual([
      { name: 'kernel', from: '0.4.9-1' },
    ]);
  });

  test('formats entries back into the text it parses', () => {
    const entries = [
      { name: 'helpers', from: '0.4.5' },
      { name: 'kernel', from: '0.4.5' },
    ];

    expect(ReleasePlanInput.format({ entries })).toBe('helpers@0.4.5,kernel@0.4.5');
    expect(ReleasePlanInput.parse({ text: ReleasePlanInput.format({ entries }) })).toEqual(entries);
  });

  test.each([
    ['an empty list', ''],
    ['only separators', ' , ,'],
    ['an unknown package', 'docs@0.4.5'],
    ['a duplicate', 'kernel@0.4.5,kernel@0.4.5'],
    ['a missing version', 'kernel'],
    ['a version that is not semver', 'kernel@latest'],
    ['a shell metacharacter', 'kernel@0.4.5;rm -rf /'],
    ['a package from a path', '../kernel@0.4.5'],
  ])('refuses %s', (_label, text) => {
    expect(() => ReleasePlanInput.parse({ text })).toThrow();
  });
});
