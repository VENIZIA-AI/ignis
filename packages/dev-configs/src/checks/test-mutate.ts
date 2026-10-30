import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Replays the mutation proof of the trim-tests method. A ledger line says: "this test (the
 * candidate) is redundant because that test (the survivor) already catches the same break". The
 * replay applies the break (the mutant) to a file, runs the survivor and the candidate, and puts the
 * file back. The survivor must go red. The candidate must go red too, unless the line says it is
 * vacuous and a second mutant leaves it green as well.
 *
 * The mutant edits the file the test really loads: the package's own `src` for a test that imports
 * through the `@/` alias, or the `dist` of the dependency for a test that reaches another package
 * through its `exports`. A rebuild is never needed.
 */
export interface IMutant {
  /** Repository-relative file to edit (a `src` file, or a `dist` file of a dependency). */
  file: string;
  /** Text that must occur exactly once in the file. */
  find: string;
  replace: string;
}

export interface ILedgerLine {
  id: string;
  /** Repository-relative test file that is deleted. */
  candidate: string;
  /** Run only the cases whose name matches (`bun test -t`). Default: the whole file. */
  candidateName?: string;
  /** Repository-relative test file that stays. */
  survivor: string;
  survivorName?: string;
  /**
   * The break. An array applies every edit together: a survivor in the package that owns the code
   * loads its `src`, a candidate in another package loads that package's `dist`, so one break is two edits.
   */
  mutant: IMutant | IMutant[];
  /** The source line the mutant stands for, `path:line`; recorded, not used by the replay. */
  srcLine?: string;
  /** `red` (default): the candidate must fail. `vacuous`: it must stay green under `mutant` AND `secondMutant`. */
  expectCandidate?: 'red' | 'vacuous';
  secondMutant?: IMutant | IMutant[];
}

export interface ILedger {
  mutants: ILedgerLine[];
}

export interface ILedgerResult {
  id: string;
  survivorRed: boolean;
  candidateRed: boolean;
  /** Only for a `vacuous` line: whether the candidate also stayed green under the second mutant. */
  candidateGreenUnderSecond?: boolean;
  ok: boolean;
  problem?: string;
}

const TEST_TIMEOUT_MILLISECONDS = 300_000;

/** The one place this tool builds an `Error`: `getError` would make dev-configs depend on inversion, which depends on dev-configs. */
// eslint-disable-next-line venizia/no-new-error -- getError would be a dev-configs -> inversion cycle
const replayError = (message: string): Error => new Error(message);

const checksum = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The nearest folder at or above the test file that holds a `package.json`: where `bun test` runs. */
const packageDirectoryOf = (opts: { root: string; file: string }): string => {
  let current = dirname(join(opts.root, opts.file));

  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current || parent.length < opts.root.length) {
      return opts.root;
    }

    current = parent;
  }
};

/** Runs one test file (or the cases matching `name`) and reports whether it failed. */
const runIsRed = (opts: { root: string; file: string; name?: string }): boolean => {
  const directory = packageDirectoryOf({ root: opts.root, file: opts.file });
  const target = join(opts.root, opts.file).slice(directory.length + 1);
  const args = ['test', target, ...(opts.name ? ['-t', opts.name] : [])];
  const result = spawnSync('bun', args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MILLISECONDS,
    killSignal: 'SIGKILL',
    env: { ...process.env, NODE_ENV: 'test' },
  });

  if (result.error) {
    throw replayError(`[test-mutate] could not run bun test ${target}: ${result.error.message}`);
  }

  // A name filter that matches nothing runs no case and exits 0: that would read as "green" and could
  // hide a typo as a vacuous test, so a run that executed nothing is an unusable ledger line.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const passed = Number(/^\s*(\d+) pass/m.exec(output)?.[1] ?? 0);
  const failed = Number(/^\s*(\d+) fail/m.exec(output)?.[1] ?? 0);

  if (passed + failed === 0) {
    throw replayError(
      `[test-mutate] bun test ${target}${opts.name ? ` -t ${opts.name}` : ''} ran no case | check the file and the name`,
    );
  }

  return result.status !== 0 || failed > 0;
};

/** Applies `mutant`, runs `action`, and puts the file back byte for byte, verified by checksum. */
const withMutant = <T>(opts: {
  root: string;
  mutant: IMutant;
  scratch: string;
  id: string;
  action: () => T;
}): T => {
  const path = join(opts.root, opts.mutant.file);
  const original = readFileSync(path);
  const text = original.toString('utf8');
  const occurrences = text.split(opts.mutant.find).length - 1;

  if (occurrences !== 1) {
    throw replayError(
      `[test-mutate][${opts.id}] \`find\` occurs ${occurrences} times in ${opts.mutant.file}, it must occur exactly once`,
    );
  }

  mkdirSync(opts.scratch, { recursive: true });
  const backup = join(opts.scratch, `test-mutate-${opts.id.replace(/[^\w.-]/g, '_')}.orig`);
  if (existsSync(backup)) {
    throw replayError(
      `[test-mutate][${opts.id}] a backup from an interrupted run exists: ${backup} | restore ${opts.mutant.file} from it, then delete it`,
    );
  }

  writeFileSync(backup, original);
  const expected = checksum(original);

  let outcome: { value: T } | { error: unknown };

  try {
    writeFileSync(
      path,
      text.replace(opts.mutant.find, () => opts.mutant.replace),
    );
    outcome = { value: opts.action() };
  } catch (error) {
    outcome = { error };
  }

  // Restored whatever the action did, and checked, before its result or error is passed on.
  writeFileSync(path, original);

  if (checksum(readFileSync(path)) !== expected) {
    throw replayError(
      `[test-mutate][${opts.id}] ${opts.mutant.file} was not restored | the backup is ${backup}`,
    );
  }

  rmSync(backup, { force: true });

  if ('error' in outcome) {
    throw outcome.error;
  }

  return outcome.value;
};

/** Applies every edit of `mutant`, runs `action`, and puts each file back byte for byte, verified by checksum. */
const withMutants = <T>(opts: {
  root: string;
  mutant: IMutant | IMutant[];
  scratch: string;
  id: string;
  action: () => T;
}): T => {
  const edits = Array.isArray(opts.mutant) ? opts.mutant : [opts.mutant];

  const apply = (index: number): T =>
    index === edits.length
      ? opts.action()
      : withMutant({
          root: opts.root,
          mutant: edits[index],
          scratch: opts.scratch,
          id: `${opts.id}-${index}`,
          action: () => apply(index + 1),
        });

  return apply(0);
};

export class TestMutateCheck {
  /** Replays every line; never throws for a green survivor (that is a result), only for an unusable ledger. */
  static replayLedger(opts: { root: string; ledger: ILedger; scratch?: string }): ILedgerResult[] {
    const root = resolve(opts.root);
    const scratch = opts.scratch ?? join(root, '.agents/local/tmp');
    const results: ILedgerResult[] = [];

    for (const line of opts.ledger.mutants) {
      const { survivorRed, candidateRed } = withMutants({
        root,
        mutant: line.mutant,
        scratch,
        id: line.id,
        action: () => ({
          survivorRed: runIsRed({ root, file: line.survivor, name: line.survivorName }),
          candidateRed: runIsRed({ root, file: line.candidate, name: line.candidateName }),
        }),
      });
      const result: ILedgerResult = { id: line.id, survivorRed, candidateRed, ok: true };
      const expectation = line.expectCandidate ?? 'red';

      if (!survivorRed) {
        result.ok = false;
        result.problem =
          'the survivor stayed green under the mutant: it does not cover the behaviour';
      } else if (expectation === 'red' && !candidateRed) {
        result.ok = false;
        result.problem =
          'the candidate stayed green under the mutant: record it as vacuous with a second mutant, or pick a mutant it checks';
      } else if (expectation === 'vacuous') {
        if (!line.secondMutant) {
          result.ok = false;
          result.problem = 'a vacuous line needs a secondMutant';
        } else if (candidateRed) {
          result.ok = false;
          result.problem = 'the candidate went red under the mutant: it is not vacuous';
        } else {
          const greenUnderSecond = !withMutants({
            root,
            mutant: line.secondMutant,
            scratch,
            id: `${line.id}-second`,
            action: () => runIsRed({ root, file: line.candidate, name: line.candidateName }),
          });
          result.candidateGreenUnderSecond = greenUnderSecond;

          if (!greenUnderSecond) {
            result.ok = false;
            result.problem = 'the candidate went red under the second mutant: it is not vacuous';
          }
        }
      }

      results.push(result);
    }

    return results;
  }

  /** The report lines of a replay, one per ledger line and a closing tally. */
  static formatLedgerResults(opts: { results: ILedgerResult[] }): string[] {
    const { results } = opts;
    const lines = results.map(
      (result) =>
        `${result.ok ? 'ok  ' : 'FAIL'} ${result.id}: survivor ${result.survivorRed ? 'red' : 'GREEN'}, candidate ${result.candidateRed ? 'red' : 'green'}${result.problem ? ` | ${result.problem}` : ''}`,
    );
    const failed = results.filter((result) => !result.ok).length;
    lines.push(
      `\n[test-mutate] ${results.length - failed}/${results.length} ledger lines hold${failed ? `, ${failed} do not` : ''}.`,
    );

    return lines;
  }
}

/** @deprecated Use `TestMutateCheck.replayLedger({ root, ledger, scratch })`. Removed in 0.5. */
export const replayLedger = (opts: {
  root: string;
  ledger: ILedger;
  scratch?: string;
}): ILedgerResult[] => TestMutateCheck.replayLedger(opts);

/** @deprecated Use `TestMutateCheck.formatLedgerResults({ results })`. Removed in 0.5. */
export const formatLedgerResults = (results: ILedgerResult[]): string[] =>
  TestMutateCheck.formatLedgerResults({ results });
