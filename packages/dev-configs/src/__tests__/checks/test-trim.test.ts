import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckCommand } from '../../cli/check';
import { checkControls, listTestTitles } from '../../checks/test-controls';
import { findDeadTestCode } from '../../checks/test-dead-code';
import { formatLedgerResults, replayLedger } from '../../checks/test-mutate';
import type { ILedgerLine } from '../../checks/test-mutate';
import { analyseJunit, formatTestWeight } from '../../checks/test-weight';

const SCRATCH = join(__dirname, '../../../../../.agents/local/tmp');
mkdirSync(SCRATCH, { recursive: true });
const folders: string[] = [];

afterAll(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A throwaway folder under the repository's scratch, with the given files. */
const makeFolder = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(SCRATCH, 'test-trim-'));
  folders.push(root);

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), content);
  }

  return root;
};

const JUNIT = (
  suites: Array<{
    file: string;
    time: number;
    assertions: number;
    skipped?: number;
    cases: Array<[string, string, number]>;
  }>,
): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test">\n${suites
    .map(
      (suite) =>
        `  <testsuite name="${suite.file}" file="${suite.file}" tests="${suite.cases.length}" assertions="${suite.assertions}" failures="0" skipped="${suite.skipped ?? 0}" time="${suite.time}" hostname="h">\n${suite.cases
          .map(
            ([name, classname, time]) =>
              `    <testcase name="${name}" classname="${classname}" time="${time}" file="${suite.file}" assertions="1" />`,
          )
          .join('\n')}\n  </testsuite>`,
    )
    .join('\n')}\n</testsuites>`;

describe('test-weight', () => {
  const alpha = JUNIT([
    {
      file: 'src/__tests__/a.test.ts',
      time: 2,
      assertions: 5,
      cases: [
        ['fast &amp; plain', 'Suite', 0.001],
        ['slow one', 'Suite', 1.9],
      ],
    },
    {
      file: 'src/__tests__/b.test.ts',
      time: 0.05,
      assertions: 0,
      skipped: 1,
      cases: [['only skipped', 'Gate', 0]],
    },
  ]);
  const beta = JUNIT([
    {
      file: 'src/__tests__/c.test.ts',
      time: 0.02,
      assertions: 2,
      cases: [['fast &amp; plain', 'Suite', 0.001]],
    },
  ]);

  test('totals, per label, the heaviest file and the slowest case', () => {
    const report = analyseJunit({
      reports: [
        { label: 'alpha', xml: alpha },
        { label: 'beta', xml: beta },
      ],
    });

    expect(report.files).toHaveLength(3);
    expect(report.totalCases).toBe(4);
    expect(report.totalAssertions).toBe(7);
    expect(report.totalSkipped).toBe(1);
    expect(report.totalMilliseconds).toBeCloseTo(2070, 0);
    expect(report.perLabel).toEqual([
      { label: 'alpha', files: 2, cases: 3, milliseconds: expect.closeTo(2050, 0) },
      { label: 'beta', files: 1, cases: 1, milliseconds: expect.closeTo(20, 0) },
    ]);
    expect(report.heaviest[0].file).toBe('src/__tests__/a.test.ts');
    expect(report.heaviest[0].slowestCase).toBe('slow one');
    expect(report.filesFor80Percent).toBe(1);
    expect(report.lightFiles.count).toBe(2);
  });

  test('positive control: the same suite and case name in two files is reported, with entities decoded', () => {
    const report = analyseJunit({
      reports: [
        { label: 'alpha', xml: alpha },
        { label: 'beta', xml: beta },
      ],
    });

    expect(report.sameNameAcrossFiles).toEqual([
      {
        name: 'Suite > fast & plain',
        files: ['alpha/src/__tests__/a.test.ts', 'beta/src/__tests__/c.test.ts'],
      },
    ]);
  });

  test('files that assert nothing and files with skips are listed', () => {
    const report = analyseJunit({ reports: [{ label: 'alpha', xml: alpha }] });

    expect(report.zeroAssertionFiles).toEqual(['src/__tests__/b.test.ts']);
    expect(report.skippedFiles).toEqual([{ file: 'alpha/src/__tests__/b.test.ts', skipped: 1 }]);
  });

  test('the printed report names the heaviest file first', () => {
    const lines = formatTestWeight({
      report: analyseJunit({ reports: [{ label: 'alpha', xml: alpha }] }),
      top: 1,
    });

    expect(lines[0]).toStartWith('files 2 | cases 3');
    expect(lines.find((line) => line.includes('a.test.ts'))).toContain('slowest');
    expect(lines.some((line) => line.includes('b.test.ts') && line.includes('ms'))).toBe(false);
  });

  test('the command: a missing file is a usage error, a real file prints and exits 0', async () => {
    const root = makeFolder({ 'alpha.xml': alpha });

    expect(await CheckCommand.run({ root, args: ['test-weight', 'nope.xml'] })).toBe(2);
    expect(await CheckCommand.run({ root, args: ['test-weight'] })).toBe(2);
    expect(await CheckCommand.run({ root, args: ['test-weight', 'alpha.xml'] })).toBe(0);
  });
});

describe('test-controls', () => {
  const SOURCE = `
    describe('gate X', () => {
      test('positive control: a bad entry is refused', () => {});
      it.skip('positive control: skipped is still a title', () => {});
      test.each([1, 2])('rows of %s', () => {});
    });
    test('unrelated', () => {});
  `;

  test('lists the titles of test, it, describe, test.each and the skip forms', async () => {
    expect(await listTestTitles({ source: SOURCE })).toEqual([
      'gate X',
      'positive control: a bad entry is refused',
      'positive control: skipped is still a title',
      'rows of %s',
      'unrelated',
    ]);
  });

  test('every registered control found: OK', async () => {
    const root = makeFolder({ 'x.test.ts': SOURCE });

    const report = await checkControls({
      root,
      controls: [
        { gate: 'x', file: 'x.test.ts', titlePattern: '^positive control', min: 2 },
        { gate: 'x', file: 'x.test.ts', titlePattern: 'rows of' },
      ],
    });

    expect(report).toEqual({ checked: 2, problems: [] });
  });

  test('positive control: a pattern that no longer matches, a count that fell and a missing file are problems', async () => {
    const root = makeFolder({ 'x.test.ts': SOURCE });

    const report = await checkControls({
      root,
      controls: [
        { gate: 'renamed', file: 'x.test.ts', titlePattern: 'negative control' },
        { gate: 'fewer', file: 'x.test.ts', titlePattern: '^positive control', min: 3 },
        { gate: 'gone', file: 'missing.test.ts', titlePattern: '.' },
      ],
    });

    expect(report.problems.map((problem) => problem.entry.gate)).toEqual([
      'renamed',
      'fewer',
      'gone',
    ]);
    expect(report.problems[0].message).toContain("gate 'renamed'");
    expect(report.problems[2].message).toContain('does not exist');
  });

  test('the command: 0 when all are found, 1 when one is gone, 2 without a registry', async () => {
    const good = makeFolder({
      'x.test.ts': SOURCE,
      'controls.json': JSON.stringify({
        controls: [{ gate: 'x', file: 'x.test.ts', titlePattern: 'unrelated' }],
      }),
    });
    const bad = makeFolder({
      'x.test.ts': SOURCE,
      'controls.json': JSON.stringify({
        controls: [{ gate: 'x', file: 'x.test.ts', titlePattern: 'removed' }],
      }),
    });

    expect(await CheckCommand.run({ root: good, args: ['test-controls', 'controls.json'] })).toBe(
      0,
    );
    expect(await CheckCommand.run({ root: bad, args: ['test-controls', 'controls.json'] })).toBe(1);
    expect(await CheckCommand.run({ root: good, args: ['test-controls'] })).toBe(2);
  });
});

describe('test-dead-code', () => {
  const gitRepository = (files: Record<string, string>): string => {
    const root = makeFolder(files);
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['add', '-A'], { cwd: root });
    return root;
  };

  test('a fixture nobody names is unreferenced, one that is imported or named by path is not', () => {
    const root = gitRepository({
      'pkg/src/__tests__/used.test.ts':
        "import { used } from './support/used-helper';\nimport data from './fixtures/data.json';\nvoid used; void data;\n",
      'pkg/src/__tests__/support/used-helper.ts': 'export const used = 1;\n',
      'pkg/src/__tests__/fixtures/data.json': '{}\n',
      'pkg/src/__tests__/support/orphan-helper.ts': 'export const orphan = 1;\n',
    });

    const candidates = findDeadTestCode({ root });

    expect(candidates.map((candidate) => candidate.file)).toEqual([
      'pkg/src/__tests__/support/orphan-helper.ts',
    ]);
  });

  test('a file whose folder is named elsewhere but not the file itself is folder-referenced', () => {
    const root = gitRepository({
      'pkg/src/__tests__/scan.test.ts': "const dir = join(__dirname, 'groups');\n",
      'pkg/src/__tests__/groups/one.ts': 'export const one = 1;\n',
    });

    expect(findDeadTestCode({ root })).toEqual([
      { file: 'pkg/src/__tests__/groups/one.ts', kind: 'folder-referenced' },
    ]);
  });

  test('test files and declaration files are never candidates', () => {
    const root = gitRepository({
      'pkg/src/__tests__/lonely.test.ts': 'export {};\n',
      'pkg/src/__tests__/types.d.ts': 'export {};\n',
    });

    expect(findDeadTestCode({ root })).toEqual([]);
  });
});

describe('test-mutate', () => {
  /** A project with a library, a survivor that checks `add`, and a candidate that checks `add` and `sub`. */
  const project = (): string =>
    makeFolder({
      'package.json': '{ "name": "mutate-fixture", "private": true }\n',
      'src/lib.ts':
        'export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n',
      'src/__tests__/survivor.test.ts':
        "import { expect, test } from 'bun:test';\nimport { add } from '../lib';\ntest('adds', () => { expect(add(2, 3)).toBe(5); });\n",
      'src/__tests__/candidate.test.ts':
        "import { expect, test } from 'bun:test';\nimport { add, sub } from '../lib';\ntest('adds again', () => { expect(add(2, 3)).toBe(5); });\ntest('subtracts', () => { expect(sub(5, 3)).toBe(2); });\n",
    });

  const line = (overrides: Partial<ILedgerLine> = {}): ILedgerLine => ({
    id: 'add-plus',
    candidate: 'src/__tests__/candidate.test.ts',
    candidateName: 'adds again',
    survivor: 'src/__tests__/survivor.test.ts',
    mutant: { file: 'src/lib.ts', find: 'a + b', replace: 'a - b' },
    ...overrides,
  });

  test('a survivor and a candidate that both catch the mutant: ok, and the file is restored byte for byte', () => {
    const root = project();
    const before = readFileSync(join(root, 'src/lib.ts'), 'utf8');

    const results = replayLedger({ root, ledger: { mutants: [line()] } });

    expect(results).toEqual([{ id: 'add-plus', survivorRed: true, candidateRed: true, ok: true }]);
    expect(readFileSync(join(root, 'src/lib.ts'), 'utf8')).toBe(before);
    expect(formatLedgerResults(results).at(-1)).toContain('1/1 ledger lines hold');
  }, 60_000);

  test('positive control: a survivor that does not cover the mutant is refused', () => {
    const root = project();

    const results = replayLedger({
      root,
      ledger: {
        mutants: [
          line({
            id: 'sub-minus',
            mutant: { file: 'src/lib.ts', find: 'a - b', replace: 'a + b' },
            candidateName: 'subtracts',
          }),
        ],
      },
    });

    expect(results[0].survivorRed).toBe(false);
    expect(results[0].ok).toBe(false);
    expect(results[0].problem).toContain('survivor stayed green');
  }, 60_000);

  test('positive control: a candidate that stays green under the mutant needs a vacuous record', () => {
    const root = project();

    const results = replayLedger({
      root,
      ledger: { mutants: [line({ candidateName: 'subtracts' })] },
    });

    expect(results[0]).toMatchObject({ survivorRed: true, candidateRed: false, ok: false });
    expect(results[0].problem).toContain('candidate stayed green');
  }, 60_000);

  test('a vacuous line holds when the candidate stays green under both mutants, and fails when the second turns it red', () => {
    const root = project();
    const vacuous = (replace: string): ILedgerLine =>
      line({
        id: 'vacuous',
        candidateName: 'subtracts',
        expectCandidate: 'vacuous',
        secondMutant: { file: 'src/lib.ts', find: 'a - b', replace },
      });

    expect(replayLedger({ root, ledger: { mutants: [vacuous('a - b')] } })[0]).toMatchObject({
      ok: true,
      candidateGreenUnderSecond: true,
    });
    expect(replayLedger({ root, ledger: { mutants: [vacuous('a * b')] } })[0]).toMatchObject({
      ok: false,
      candidateGreenUnderSecond: false,
    });
  }, 120_000);

  test('a find that occurs twice, or a name that matches no case, is an unusable line, and the file is still restored', () => {
    const root = project();
    const before = readFileSync(join(root, 'src/lib.ts'), 'utf8');

    expect(() =>
      replayLedger({
        root,
        ledger: {
          mutants: [line({ mutant: { file: 'src/lib.ts', find: 'number', replace: 'string' } })],
        },
      }),
    ).toThrow(/occurs 4 times/);
    expect(() =>
      replayLedger({ root, ledger: { mutants: [line({ candidateName: 'no such case' })] } }),
    ).toThrow(/ran no case/);
    expect(readFileSync(join(root, 'src/lib.ts'), 'utf8')).toBe(before);
    expect(existsSync(join(root, '.agents/local/tmp'))).toBe(true);
    expect(readFileSync(join(root, 'src/lib.ts'), 'utf8')).toBe(before);
  }, 60_000);

  test('an array applies every edit, and every file is restored', () => {
    const root = project();
    writeFileSync(join(root, 'src/other.ts'), 'export const k = 1;\n');
    const lib = readFileSync(join(root, 'src/lib.ts'), 'utf8');

    const results = replayLedger({
      root,
      ledger: {
        mutants: [
          line({
            id: 'two-edits',
            mutant: [
              { file: 'src/lib.ts', find: 'a + b', replace: 'a - b' },
              { file: 'src/other.ts', find: 'k = 1', replace: 'k = 2' },
            ],
          }),
        ],
      },
    });

    expect(results[0].ok).toBe(true);
    expect(readFileSync(join(root, 'src/lib.ts'), 'utf8')).toBe(lib);
    expect(readFileSync(join(root, 'src/other.ts'), 'utf8')).toBe('export const k = 1;\n');
  }, 60_000);

  test('a backup left by an interrupted run stops the replay', () => {
    const root = project();
    mkdirSync(join(root, '.agents/local/tmp'), { recursive: true });
    writeFileSync(join(root, '.agents/local/tmp/test-mutate-add-plus-0.orig'), 'x');

    expect(() => replayLedger({ root, ledger: { mutants: [line()] } })).toThrow(/interrupted run/);
  });

  test('the command: exit 0 when every line holds, 1 when one does not, 2 without a ledger', async () => {
    const root = project();
    writeFileSync(join(root, 'good.json'), JSON.stringify({ mutants: [line()] }));
    writeFileSync(
      join(root, 'bad.json'),
      JSON.stringify({
        mutants: [
          line({
            id: 'bad',
            mutant: { file: 'src/lib.ts', find: 'a - b', replace: 'a + b' },
            candidateName: 'subtracts',
          }),
        ],
      }),
    );

    expect(await CheckCommand.run({ root, args: ['test-mutate', 'good.json'] })).toBe(0);
    expect(await CheckCommand.run({ root, args: ['test-mutate', 'bad.json'] })).toBe(1);
    expect(await CheckCommand.run({ root, args: ['test-mutate'] })).toBe(2);
  }, 120_000);
});
