/**
 * Reads the JUnit report of `bun test --reporter=junit` and says where the test time and the test
 * count are: per file, per package, the heaviest files, duplicates by name, files that assert nothing,
 * and skips. The first step of the trim-tests method (`.agents/knowledge/process/trimming-tests.md`).
 *
 * The numbers are only as good as the run that made them: a `--parallel` run times each file under
 * contention, so a file that takes 7 s there can take 1 s alone. Re-time a suspect file alone.
 */
export interface ITestWeightInput {
  /** Names the report in the output: the package. */
  label: string;
  xml: string;
}

export interface ITestFileWeight {
  label: string;
  file: string;
  milliseconds: number;
  cases: number;
  assertions: number;
  skipped: number;
  slowestCase: string;
  slowestMilliseconds: number;
}

export interface ITestWeightReport {
  files: ITestFileWeight[];
  totalMilliseconds: number;
  totalCases: number;
  totalAssertions: number;
  totalSkipped: number;
  perLabel: Array<{ label: string; files: number; cases: number; milliseconds: number }>;
  /** Heaviest first. */
  heaviest: ITestFileWeight[];
  /** How many of the heaviest files hold 80% of the time. */
  filesFor80Percent: number;
  /** Files that take under 100 ms, and what they cost together. */
  lightFiles: { count: number; milliseconds: number };
  /** The same suite and case name in more than one file. */
  sameNameAcrossFiles: Array<{ name: string; files: string[] }>;
  zeroAssertionFiles: string[];
  skippedFiles: Array<{ file: string; skipped: number }>;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }

    if (body.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }

    return ENTITIES[body] ?? whole;
  });

/** Bun writes a file as a top-level suite whose `name` equals its `file`. */
const FILE_SUITE =
  /<testsuite name="([^"]+\.(?:test|spec)\.[cm]?[jt]sx?)" file="[^"]+" tests="(\d+)" assertions="(\d+)" failures="\d+" skipped="(\d+)" time="([\d.eE+-]+)"/g;
const CASE = /<testcase name="([^"]*)" classname="([^"]*)" time="([\d.eE+-]+)" file="([^"]+)"/g;

const LIGHT_FILE_MILLISECONDS = 100;
const HEAVY_SHARE = 0.8;

export const analyseJunit = (opts: { reports: ITestWeightInput[] }): ITestWeightReport => {
  const files: ITestFileWeight[] = [];
  const names = new Map<string, Set<string>>();

  for (const { label, xml } of opts.reports) {
    const start = files.length;

    for (const match of xml.matchAll(FILE_SUITE)) {
      files.push({
        label,
        file: match[1],
        milliseconds: Number(match[5]) * 1000,
        cases: Number(match[2]),
        assertions: Number(match[3]),
        skipped: Number(match[4]),
        slowestCase: '',
        slowestMilliseconds: 0,
      });
    }

    const byFile = new Map(files.slice(start).map((entry) => [entry.file, entry]));
    for (const match of xml.matchAll(CASE)) {
      const caseName = decodeEntities(match[1]);
      const suiteName = decodeEntities(match[2]);
      const entry = byFile.get(match[4]);
      const milliseconds = Number(match[3]) * 1000;

      if (entry && milliseconds > entry.slowestMilliseconds) {
        entry.slowestMilliseconds = milliseconds;
        entry.slowestCase = caseName;
      }

      const key = `${suiteName} > ${caseName}`;
      const where = names.get(key) ?? new Set<string>();
      where.add(`${label}/${match[4]}`);
      names.set(key, where);
    }
  }

  const heaviest = [...files].sort((left, right) => right.milliseconds - left.milliseconds);
  const totalMilliseconds = files.reduce((sum, entry) => sum + entry.milliseconds, 0);

  let accumulated = 0;
  let filesFor80Percent = 0;
  for (const entry of heaviest) {
    accumulated += entry.milliseconds;
    filesFor80Percent += 1;

    if (accumulated >= totalMilliseconds * HEAVY_SHARE) {
      break;
    }
  }

  const light = files.filter((entry) => entry.milliseconds < LIGHT_FILE_MILLISECONDS);
  const labels = [...new Set(files.map((entry) => entry.label))];

  return {
    files,
    totalMilliseconds,
    totalCases: files.reduce((sum, entry) => sum + entry.cases, 0),
    totalAssertions: files.reduce((sum, entry) => sum + entry.assertions, 0),
    totalSkipped: files.reduce((sum, entry) => sum + entry.skipped, 0),
    perLabel: labels.map((label) => {
      const own = files.filter((entry) => entry.label === label);
      return {
        label,
        files: own.length,
        cases: own.reduce((sum, entry) => sum + entry.cases, 0),
        milliseconds: own.reduce((sum, entry) => sum + entry.milliseconds, 0),
      };
    }),
    heaviest,
    filesFor80Percent,
    lightFiles: {
      count: light.length,
      milliseconds: light.reduce((sum, entry) => sum + entry.milliseconds, 0),
    },
    sameNameAcrossFiles: [...names.entries()]
      .filter(([, where]) => where.size > 1)
      .map(([name, where]) => ({ name, files: [...where].sort() })),
    zeroAssertionFiles: files.filter((entry) => entry.assertions === 0).map((entry) => entry.file),
    skippedFiles: files
      .filter((entry) => entry.skipped > 0)
      .map((entry) => ({ file: `${entry.label}/${entry.file}`, skipped: entry.skipped })),
  };
};

/** The report as the lines `devz check test-weight` prints. */
export const formatTestWeight = (opts: { report: ITestWeightReport; top?: number }): string[] => {
  const { report, top = 25 } = opts;
  const seconds = (milliseconds: number): string => (milliseconds / 1000).toFixed(1);
  const lines: string[] = [
    `files ${report.files.length} | cases ${report.totalCases} | assertions ${report.totalAssertions} | skipped ${report.totalSkipped} | sum of file times ${seconds(report.totalMilliseconds)} s`,
  ];

  for (const row of report.perLabel) {
    lines.push(
      `  ${row.label.padEnd(14)} files ${String(row.files).padStart(4)} cases ${String(row.cases).padStart(5)} time ${seconds(row.milliseconds).padStart(7)} s`,
    );
  }

  lines.push('', `heaviest ${top} files:`);
  for (const entry of report.heaviest.slice(0, top)) {
    lines.push(
      `${entry.milliseconds.toFixed(0).padStart(8)} ms ${String(entry.cases).padStart(5)} cases  slowest ${entry.slowestMilliseconds.toFixed(0).padStart(7)} ms  ${entry.label}/${entry.file}`,
    );
  }

  lines.push(
    '',
    `80% of the time is in the ${report.filesFor80Percent} heaviest files of ${report.files.length}`,
    `files under ${LIGHT_FILE_MILLISECONDS} ms: ${report.lightFiles.count}, together ${seconds(report.lightFiles.milliseconds)} s`,
    `same suite and case name in more than one file: ${report.sameNameAcrossFiles.length}`,
  );
  for (const duplicate of report.sameNameAcrossFiles.slice(0, 10)) {
    lines.push(`  ${duplicate.name.slice(0, 90)} -> ${duplicate.files.join(', ')}`);
  }

  lines.push(
    `files with 0 assertions: ${report.zeroAssertionFiles.length}${report.zeroAssertionFiles.length ? ` (${report.zeroAssertionFiles.slice(0, 3).join(', ')})` : ''}`,
    `files with skipped cases: ${report.skippedFiles.length} (${report.skippedFiles.reduce((sum, entry) => sum + entry.skipped, 0)} cases)`,
  );

  return lines;
};
