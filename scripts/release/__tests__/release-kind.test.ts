import { describe, expect, test } from 'bun:test';
import { ReleaseModes, ReleaseOrder, type TReleaseMode } from '../release-constants';
import { ReleaseKinds, ReleaseTargets } from '../release-kind';

/** `main` right after a Sync: three packages are prereleases, the rest are stable. */
const mainVersions = (overrides: Record<string, string> = {}): Map<string, string> =>
  new Map(
    ReleaseOrder.NAMES.map((name) => [
      name,
      overrides[name] ?? (['helpers', 'kernel', 'connectors'].includes(name) ? '0.4.9-1' : '0.4.8'),
    ]),
  );

const entriesOf = (versions: Map<string, string>, names?: string[]) =>
  [...versions]
    .filter(([name]) => !names || names.includes(name))
    .map(([name, from]) => ({ name, from }));

describe('ReleaseKinds', () => {
  test('the mode decides the kind', () => {
    const kinds = [...ReleaseModes.SCHEME_SET].map(
      (mode) => `${mode}:${ReleaseKinds.ofMode({ mode: mode as TReleaseMode })}`,
    );

    expect(kinds).toEqual([
      'patch:stable',
      'minor:stable',
      'major:stable',
      'prepatch:prerelease',
      'preminor:prerelease',
      'premajor:prerelease',
      'prerelease:prerelease',
    ]);
  });

  test('a prerelease runs from develop and a stable from main', () => {
    expect(ReleaseKinds.branchOf({ kind: 'prerelease' })).toBe('develop');
    expect(ReleaseKinds.branchOf({ kind: 'stable' })).toBe('main');
  });

  test('checkRef accepts only the branch of the kind', () => {
    const cases: Array<[Parameters<typeof ReleaseKinds.checkRef>[0], boolean]> = [
      [{ kind: 'prerelease', ref: 'refs/heads/develop' }, true],
      [{ kind: 'prerelease', ref: 'refs/heads/main' }, false],
      [{ kind: 'stable', ref: 'refs/heads/main' }, true],
      [{ kind: 'stable', ref: 'refs/heads/develop' }, false],
      [{ kind: 'stable', ref: 'refs/heads/feature/x' }, false],
      [{ kind: 'prerelease', ref: 'refs/tags/kernel-v0.4.9' }, false],
      [{ kind: 'stable', ref: undefined }, false],
    ];

    for (const [input, accepted] of cases) {
      expect(ReleaseKinds.checkRef(input) === undefined).toBe(accepted);
    }
  });
});

describe('ReleaseTargets.distTagOf and of', () => {
  test('the dist-tag follows the version, not the mode', () => {
    expect(ReleaseTargets.distTagOf({ version: '0.4.9-1' })).toBe('next');
    expect(ReleaseTargets.distTagOf({ version: '0.4.9' })).toBe('latest');
  });

  test('targets for every mode carry the dist-tag of their version', () => {
    const entries = [{ name: 'kernel', from: '0.4.9-1' }];
    const tagOf = (mode: TReleaseMode) =>
      ReleaseTargets.of({ entries, mode }).map((entry) => `${entry.target}:${entry.distTag}`)[0];

    expect(tagOf('prerelease')).toBe('0.4.9-2:next');
    expect(tagOf('prepatch')).toBe('0.4.10-0:next');
    expect(tagOf('patch')).toBe('0.4.9:latest');
    expect(tagOf('minor')).toBe('0.5.0:latest');
    expect(tagOf('major')).toBe('1.0.0:latest');
  });

  test('a minor over a prerelease of its own minor gives that minor (the quirk)', () => {
    const [target] = ReleaseTargets.of({
      entries: [{ name: 'kernel', from: '0.4.0-3' }],
      mode: 'minor',
    });

    expect(target.target).toBe('0.4.0');
  });
});

describe('ReleaseTargets.scopeOf and checkScope: a patch', () => {
  test('moves exactly the packages that have a prerelease part', () => {
    const versions = mainVersions();

    expect(ReleaseTargets.scopeOf({ mode: 'patch', versions }).map((entry) => entry.name)).toEqual([
      'helpers',
      'kernel',
      'connectors',
    ]);
  });

  test('accepts that scope', () => {
    const versions = mainVersions();
    const entries = ReleaseTargets.scopeOf({ mode: 'patch', versions });

    expect(ReleaseTargets.checkScope({ mode: 'patch', entries, versions })).toEqual([]);
  });

  test('refuses a prerelease package left out of the plan', () => {
    const versions = mainVersions();
    const entries = entriesOf(versions, ['helpers', 'kernel']);

    const problems = ReleaseTargets.checkScope({ mode: 'patch', entries, versions });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('connectors');
  });

  test('refuses a package that is already stable (a stable exists for it)', () => {
    const versions = mainVersions();
    const entries = entriesOf(versions, ['helpers', 'kernel', 'connectors', 'inversion']);

    const problems = ReleaseTargets.checkScope({ mode: 'patch', entries, versions });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('inversion');
    expect(problems[0]).toContain('nothing to promote');
  });

  test('refuses a plan whose from is not the version on the commit', () => {
    const versions = mainVersions();
    const entries = [
      { name: 'helpers', from: '0.4.9-0' },
      { name: 'kernel', from: '0.4.9-1' },
      { name: 'connectors', from: '0.4.9-1' },
    ];

    const problems = ReleaseTargets.checkScope({ mode: 'patch', entries, versions });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('helpers');
    expect(problems[0]).toContain('stale');
  });

  test('a re-dispatch after a stop passes: a package already released does not count against the scope', () => {
    const before = mainVersions();
    const entries = ReleaseTargets.scopeOf({ mode: 'patch', versions: before });
    const after = mainVersions({ helpers: '0.4.9' });

    expect(ReleaseTargets.checkScope({ mode: 'patch', entries, versions: after })).toEqual([]);
  });

  test('a prerelease run has no scope rule', () => {
    const versions = mainVersions();

    expect(
      ReleaseTargets.checkScope({
        mode: 'prerelease',
        entries: entriesOf(versions, ['kernel']),
        versions,
      }),
    ).toEqual([]);
  });
});

describe('ReleaseTargets.checkScope: a minor or a major', () => {
  test('moves all nine, a package never prereleased from its stable version', () => {
    const versions = mainVersions();
    const entries = ReleaseTargets.scopeOf({ mode: 'minor', versions });
    const targets = ReleaseTargets.of({ entries, mode: 'minor' });

    expect(entries).toHaveLength(9);
    expect(targets.find((entry) => entry.name === 'inversion')?.target).toBe('0.5.0');
    expect(targets.find((entry) => entry.name === 'kernel')?.target).toBe('0.5.0');
    expect(ReleaseTargets.checkScope({ mode: 'minor', entries, versions })).toEqual([]);
  });

  test('refuses a plan of fewer than nine', () => {
    const versions = mainVersions();
    const entries = entriesOf(versions, ['helpers', 'kernel']);

    const problems = ReleaseTargets.checkScope({ mode: 'major', entries, versions });

    expect(problems.length).toBe(7);
    expect(problems.every((problem) => problem.includes('missing from the plan'))).toBe(true);
  });

  test('refuses packages on different lines: a fresh plan after a partial minor would move some twice', () => {
    const versions = mainVersions({ inversion: '0.5.0', filter: '0.5.0' });
    const entries = ReleaseTargets.scopeOf({ mode: 'minor', versions });

    const problems = ReleaseTargets.checkScope({ mode: 'minor', entries, versions });

    expect(problems.some((problem) => problem.includes('different lines'))).toBe(true);
  });

  test('accepts the unchanged plan after a partial minor, with patch parts that differ', () => {
    const before = mainVersions({ helpers: '0.4.9-1', boot: '0.4.2' });
    const entries = ReleaseTargets.scopeOf({ mode: 'minor', versions: before });
    const after = new Map(before);
    after.set('dev-configs', '0.5.0');
    after.set('inversion', '0.5.0');

    expect(ReleaseTargets.checkScope({ mode: 'minor', entries, versions: after })).toEqual([]);
  });
});

describe('ReleaseTargets.plan', () => {
  test('a stable on main: kind, branch, targets, headline and a table', () => {
    const versions = mainVersions();
    const entries = ReleaseTargets.scopeOf({ mode: 'patch', versions });

    const plan = ReleaseTargets.plan({ entries, mode: 'patch', ref: 'refs/heads/main', versions });

    expect(plan.kind).toBe('stable');
    expect(plan.branch).toBe('main');
    expect(plan.headline).toBe('3 packages, up to 0.4.9');
    expect(plan.summary[2]).toBe('| helpers | 0.4.9-1 | 0.4.9 | latest |');
  });

  test('a prerelease on develop', () => {
    const versions = mainVersions();

    const plan = ReleaseTargets.plan({
      entries: [{ name: 'kernel', from: '0.4.9-1' }],
      mode: 'prerelease',
      ref: 'refs/heads/develop',
      versions,
    });

    expect(plan.kind).toBe('prerelease');
    expect(plan.branch).toBe('develop');
    expect(plan.targets[0].distTag).toBe('next');
  });

  test('refuses a stable on develop and says why, with every other reason too', () => {
    const versions = mainVersions();

    expect(() =>
      ReleaseTargets.plan({
        entries: entriesOf(versions, ['kernel']),
        mode: 'patch',
        ref: 'refs/heads/develop',
        versions,
      }),
    ).toThrow(/runs from main[\s\S]*missing from the plan/);
  });

  test('the headline names the highest target, by semver and not by text', () => {
    expect(
      ReleaseTargets.headlineOf({
        targets: [
          { name: 'a', from: '0.4.9', target: '0.4.10', distTag: 'latest' },
          { name: 'b', from: '0.4.8', target: '0.4.9', distTag: 'latest' },
        ],
      }),
    ).toBe('2 packages, up to 0.4.10');
  });
});

describe('ReleaseTargets.labelOf and labelProblems: the run title', () => {
  const SHA = 'c84852a7e1d0b6a2f3c9d8e7b6a5f4e3d2c1b0a9';
  const TARGETS = ReleaseTargets.of({
    entries: [
      { name: 'helpers', from: '0.4.5' },
      { name: 'inversion', from: '0.4.4' },
      { name: 'kernel', from: '0.4.5' },
    ],
    mode: 'prerelease',
  });

  test('is the kind, each version from the highest down with its packages, the issue and the short commit', () => {
    expect(
      ReleaseTargets.labelOf({ kind: 'prerelease', targets: TARGETS, issue: '664', sha: SHA }),
    ).toBe('prerelease · 0.4.6-0 helpers,kernel; 0.4.5-0 inversion · #664 · c84852a');
  });

  test('the versions are ordered by semver, not by text', () => {
    const targets = [
      { name: 'helpers', from: '0.4.9', target: '0.4.10', distTag: 'latest' as const },
      { name: 'kernel', from: '0.4.8', target: '0.4.9', distTag: 'latest' as const },
    ];

    expect(ReleaseTargets.labelOf({ kind: 'stable', targets })).toBe(
      'stable · 0.4.10 helpers; 0.4.9 kernel',
    );
  });

  test('no issue and no commit leave their parts out', () => {
    const label = 'prerelease · 0.4.6-0 helpers,kernel; 0.4.5-0 inversion';

    expect(ReleaseTargets.labelOf({ kind: 'prerelease', targets: TARGETS })).toBe(label);
    expect(
      ReleaseTargets.labelOf({ kind: 'prerelease', targets: TARGETS, issue: '', sha: '' }),
    ).toBe(label);
  });

  test('labelProblems accepts the expected label and an empty or absent one, and refuses any other', () => {
    const expected = ReleaseTargets.labelOf({ kind: 'stable', targets: TARGETS, sha: SHA });

    expect(ReleaseTargets.labelProblems({ label: expected, expected })).toEqual([]);
    expect(ReleaseTargets.labelProblems({ label: '', expected })).toEqual([]);
    expect(ReleaseTargets.labelProblems({ label: undefined, expected })).toEqual([]);
    expect(
      ReleaseTargets.labelProblems({ label: 'stable · 0.4.7 helpers', expected })[0],
    ).toContain('is not what the plan computes');
  });

  test('the refusal quotes the label, so a newline or a :: line cannot forge a log line', () => {
    const [problem] = ReleaseTargets.labelProblems({
      label: 'x\n::add-mask::y',
      expected: 'stable',
    });

    expect(problem).toContain('"x\\n::add-mask::y"');
    expect(problem).not.toContain('\n');
  });
});
