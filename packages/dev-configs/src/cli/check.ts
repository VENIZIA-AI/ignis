import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { findCatalogProblems } from '../checks/catalog';
import { runModuleCycles } from '../checks/module-cycles';
import { checkPurity } from '../checks/purity/run';
import { SplitReport } from '../checks/split-report';
import { checkControls } from '../checks/test-controls';
import type { IControlEntry } from '../checks/test-controls';
import { findDeadTestCode } from '../checks/test-dead-code';
import { formatLedgerResults, replayLedger } from '../checks/test-mutate';
import type { ILedger } from '../checks/test-mutate';
import { analyseJunit, formatTestWeight } from '../checks/test-weight';
import type { IPurityClaim, IPurityOptions } from '../checks/purity/manifest';

const USAGE = `Usage: devz check <name> [options]

Checks:
  purity [package] --claims <file> [--json]   probe every entry claimed browser-pure (needs a build)
  module-cycles <dir> [--max <n>]             list the import cycles of a built ESM folder
  split-report [--dist <dir>] [folder...]     report hub files, stray types, missing barrels, long files, cycles (never a gate)
  catalog [--glob <pattern>]... [--pinned <file>]... [--preset-prefix <prefix>]
                                              guard dependency ranges against the root workspaces.catalog
  test-weight [--top <n>] <junit.xml>...      per-file time, cases, assertions, duplicates and skips from bun's JUnit report
  test-dead-code                              list support files under __tests__ that no other file refers to (candidates)
  test-mutate <ledger.json>                   replay a mutation ledger: the survivor must go red under each mutant
  test-controls <registry.json>               fail when a registered positive-control test is gone

purity
  --claims <file>   a module that exports PURITY_CLAIMS (the claims) and, optionally, PURITY_OPTIONS
  [package]         probe only the rows of this package; a token that matches nothing fails
  --json            print the verdict as JSON (no paths of this machine, no timing) instead of the report


test-weight, test-dead-code, test-mutate, test-controls: the tools of the trim-tests method, see
  .agents/knowledge/process/trimming-tests.md in the IGNIS repository. Produce the JUnit files with
  bun test ./src --parallel --reporter=junit --reporter-outfile=<file>.

module-cycles
  <dir>, or --dist <dir>   the built folder (dist/esm); exits 1 when more cycles than --max, 2 on a usage error

split-report
  --dist <dir>   the built ESM folder inside a package: dist/esm, or dist where one build is published (default dist)
  [folder...]    package folders to report; none scans every packages/* and examples/* that has a src/

catalog
  --glob <pattern>      a manifest glob beside packages/*/package.json (repeatable)
  --pinned <file>       a manifest outside the workspace: its catalogued ranges must equal the catalog's (repeatable)
  --preset-prefix <p>   files under this prefix are presets: catalog: is allowed in their peerDependencies

  --help            print this text and exit`;

/** A usage error: nothing was probed. */
const USAGE_ERROR_CODE = 2;

interface IClaimsModule {
  PURITY_CLAIMS?: IPurityClaim[];
  PURITY_OPTIONS?: IPurityOptions;
}

interface IPurityArguments {
  claimsFile?: string;
  filter?: string;
  json: boolean;
}

const parsePurityArguments = (args: string[]): IPurityArguments | string => {
  const parsed: IPurityArguments = { json: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      parsed.json = true;
      continue;
    }

    if (arg === '--claims') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return '--claims needs a file';
      }

      parsed.claimsFile = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      return `unknown option "${arg}"`;
    }

    if (parsed.filter !== undefined) {
      return `unexpected argument "${arg}"`;
    }

    parsed.filter = arg;
  }

  return parsed;
};

/** Splits repeatable `--name value` options and positionals; `undefined` for an option that lacks its value. */
const parseRepeatable = (opts: {
  args: string[];
  repeatable: string[];
  single: string[];
}): { positionals: string[]; values: Record<string, string[]> } | string => {
  const { args, repeatable, single } = opts;
  const values: Record<string, string[]> = {};
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (!repeatable.includes(name) && !single.includes(name)) {
        return `unknown option "${arg}"`;
      }

      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return `${arg} needs a value`;
      }

      values[name] = [...(values[name] ?? []), value];
      index += 1;
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, values };
};

/** `devz check <name>`: runs one of the shared repository gates in the current folder. */
export class CheckCommand {
  private static runTestWeight(opts: { root: string; args: string[] }): number {
    const parsed = parseRepeatable({ args: opts.args, repeatable: [], single: ['top'] });
    if (typeof parsed === 'string' || parsed.positionals.length === 0) {
      console.error(
        `devz check test-weight: ${typeof parsed === 'string' ? parsed : 'give at least one JUnit file'}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const reports = parsed.positionals.map((file) => {
      const path = resolve(opts.root, file);
      return {
        label: basename(file).replace(/\.xml$/, ''),
        xml: existsSync(path) ? readFileSync(path, 'utf8') : '',
      };
    });
    const missing = parsed.positionals.filter((file) => !existsSync(resolve(opts.root, file)));
    if (missing.length > 0) {
      console.error(`devz check test-weight: not found: ${missing.join(', ')}`);
      return USAGE_ERROR_CODE;
    }

    const top = parsed.values.top?.[0] === undefined ? undefined : Number(parsed.values.top[0]);
    for (const line of formatTestWeight({ report: analyseJunit({ reports }), top })) {
      console.log(line);
    }

    return 0;
  }

  private static runTestDeadCode(opts: { root: string; args: string[] }): number {
    if (opts.args.length > 0) {
      console.error(`devz check test-dead-code: unexpected argument "${opts.args[0]}"\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const candidates = findDeadTestCode({ root: opts.root });
    for (const kind of ['unreferenced', 'folder-referenced'] as const) {
      const own = candidates.filter((candidate) => candidate.kind === kind);
      console.log(`${kind}: ${own.length}`);
      for (const candidate of own) {
        console.log(`  ${candidate.file}`);
      }
    }
    console.log(
      '\nThese are candidates: delete one, run the package suite, and keep it if anything fails or loads it by a built path.',
    );

    return 0;
  }

  private static runTestMutate(opts: { root: string; args: string[] }): number {
    const [file, ...extra] = opts.args;
    if (file === undefined || extra.length > 0) {
      console.error(`devz check test-mutate: give one ledger file\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const path = resolve(opts.root, file);
    if (!existsSync(path)) {
      console.error(`devz check test-mutate: ledger not found: ${file}`);
      return USAGE_ERROR_CODE;
    }

    const ledger: ILedger = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(ledger.mutants)) {
      console.error(`devz check test-mutate: ${file} has no "mutants" array`);
      return USAGE_ERROR_CODE;
    }

    const results = replayLedger({ root: opts.root, ledger });
    for (const line of formatLedgerResults(results)) {
      console.log(line);
    }

    return results.every((result) => result.ok) ? 0 : 1;
  }

  private static async runTestControls(opts: { root: string; args: string[] }): Promise<number> {
    const [file, ...extra] = opts.args;
    if (file === undefined || extra.length > 0) {
      console.error(`devz check test-controls: give one registry file\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const path = resolve(opts.root, file);
    if (!existsSync(path)) {
      console.error(`devz check test-controls: registry not found: ${file}`);
      return USAGE_ERROR_CODE;
    }

    const registry: { controls?: IControlEntry[] } = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(registry.controls)) {
      console.error(`devz check test-controls: ${file} has no "controls" array`);
      return USAGE_ERROR_CODE;
    }

    const report = await checkControls({ root: opts.root, controls: registry.controls });
    if (report.problems.length === 0) {
      console.log(`test-controls: OK - ${report.checked} registered controls found`);
      return 0;
    }

    console.error(
      `test-controls: ${report.problems.length} of ${report.checked} registered controls are gone:`,
    );
    for (const problem of report.problems) {
      console.error(`  [${problem.entry.gate}] ${problem.message}`);
    }

    return 1;
  }

  private static runSplitReport(opts: { root: string; args: string[] }): number {
    const parsed = parseRepeatable({ args: opts.args, repeatable: [], single: ['dist'] });
    if (typeof parsed === 'string') {
      console.error(`devz check split-report: ${parsed}\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const targets = parsed.positionals.length
      ? parsed.positionals.map((target) => resolve(opts.root, target))
      : SplitReport.defaultTargets({ root: opts.root });

    for (const packageDir of targets) {
      SplitReport.run({ packageDir, distDir: parsed.values.dist?.[0] });
    }

    return 0;
  }

  private static async runCatalog(opts: { root: string; args: string[] }): Promise<number> {
    const parsed = parseRepeatable({
      args: opts.args,
      repeatable: ['glob', 'pinned'],
      single: ['preset-prefix'],
    });
    if (typeof parsed === 'string' || parsed.positionals.length > 0) {
      console.error(
        `devz check catalog: ${typeof parsed === 'string' ? parsed : `unexpected argument "${parsed.positionals[0]}"`}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const report = await findCatalogProblems({
      root: opts.root,
      globs: parsed.values.glob,
      pinned: parsed.values.pinned,
      presetPrefix: parsed.values['preset-prefix']?.[0],
    });

    if (report.noCatalog) {
      console.error('check-catalog: no `workspaces.catalog` in the root package.json');
      return 1;
    }

    if (report.problems.length === 0) {
      console.log(`check-catalog: OK - ${report.entries} entries, ${report.referenced} referenced`);
      return 0;
    }

    console.error(`check-catalog: ${report.problems.length} problem(s):`);
    for (const problem of report.problems) {
      console.error(`  ${problem.file}: ${problem.message}`);
    }

    return 1;
  }

  static async run(opts: { root: string; args?: string[] }): Promise<number> {
    const { root, args = [] } = opts;
    const [name, ...rest] = args;

    if (name === undefined || name === '--help' || name === '-h') {
      console.log(USAGE);
      return name === undefined ? USAGE_ERROR_CODE : 0;
    }

    if (name === 'module-cycles') {
      return runModuleCycles({
        args: rest,
        print: (line) => console.log(line),
        printError: (line) => console.error(line),
      });
    }

    if (name === 'split-report') {
      return CheckCommand.runSplitReport({ root, args: rest });
    }

    if (name === 'catalog') {
      return CheckCommand.runCatalog({ root, args: rest });
    }

    if (name === 'test-weight') {
      return CheckCommand.runTestWeight({ root, args: rest });
    }

    if (name === 'test-dead-code') {
      return CheckCommand.runTestDeadCode({ root, args: rest });
    }

    if (name === 'test-mutate') {
      return CheckCommand.runTestMutate({ root, args: rest });
    }

    if (name === 'test-controls') {
      return CheckCommand.runTestControls({ root, args: rest });
    }

    if (name !== 'purity') {
      console.error(`devz check: unknown check "${name}"\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    if (rest.includes('--help') || rest.includes('-h')) {
      console.log(USAGE);
      return 0;
    }

    const parsed = parsePurityArguments(rest);
    if (typeof parsed === 'string') {
      console.error(`devz check purity: ${parsed}\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    if (parsed.claimsFile === undefined) {
      console.error(`devz check purity: --claims <file> is required\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const claimsPath = isAbsolute(parsed.claimsFile)
      ? parsed.claimsFile
      : resolve(root, parsed.claimsFile);
    if (!existsSync(claimsPath)) {
      console.error(`devz check purity: claims file not found: ${parsed.claimsFile}`);
      return USAGE_ERROR_CODE;
    }

    const claimsModule: IClaimsModule = await import(claimsPath);
    if (!Array.isArray(claimsModule.PURITY_CLAIMS)) {
      console.error(`devz check purity: ${parsed.claimsFile} does not export PURITY_CLAIMS`);
      return USAGE_ERROR_CODE;
    }

    const lines: string[] = [];
    const report = await checkPurity({
      root,
      claims: claimsModule.PURITY_CLAIMS,
      options: claimsModule.PURITY_OPTIONS,
      filter: parsed.filter,
      claimsFile: relative(root, claimsPath),
      print: (line) => (parsed.json ? lines.push(line) : console.log(line)),
      printError: (line) => console.error(line),
    });

    if (report === undefined) {
      return 1;
    }

    if (parsed.json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report.failed > 0 ? 1 : 0;
  }
}
