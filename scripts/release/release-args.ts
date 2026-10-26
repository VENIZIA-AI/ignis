import { ReleaseModes, type TReleaseMode } from './release-constants';

export type { TReleaseMode };

export interface IReleaseArgs {
  isDryRun: boolean;
  isConfirmed: boolean;
  mode: TReleaseMode;
  /** Resuming a chain that stopped: the packages an earlier run already published. */
  seeded: Array<string>;
  issue?: string;
  /** The package names given on the command line, in the order given. */
  named: Array<string>;
}

/** Parses the command line of scripts/release/release.ts. Throws on an `--issue` that is not a number. */
export const parseReleaseArgs = (args: ReadonlyArray<string>): IReleaseArgs => {
  const modeIndex = args.indexOf('--mode');
  const requestedMode = modeIndex >= 0 ? args[modeIndex + 1] : ReleaseModes.PRERELEASE;
  if (requestedMode === undefined || !ReleaseModes.isValid(requestedMode)) {
    throw new Error(
      `--mode must be one of ${[...ReleaseModes.SCHEME_SET].join(', ')}, got: ${requestedMode ?? 'nothing'}`,
    );
  }
  const mode = requestedMode;
  const seedIndex = args.indexOf('--chain-released');
  const seeded = seedIndex >= 0 ? (args[seedIndex + 1] ?? '').split(',').filter(Boolean) : [];
  const issueIndex = args.indexOf('--issue');
  const issue = issueIndex >= 0 ? args[issueIndex + 1] : undefined;
  if (issueIndex >= 0 && !/^\d+$/.test(issue ?? '')) {
    throw new Error(`--issue needs an issue number, got: ${issue ?? 'nothing'}`);
  }

  // A value is skipped by its position right after its own flag - never by its text, and never by
  // `args[-1 + 1]` when the flag is absent, which once dropped the first package name.
  const valueIndexes = new Set(
    [modeIndex, seedIndex, issueIndex].filter((index) => index >= 0).map((index) => index + 1),
  );
  const named = args.filter((arg, index) => !arg.startsWith('--') && !valueIndexes.has(index));

  return {
    isDryRun: args.includes('--dry-run'),
    isConfirmed: args.includes('--yes'),
    mode,
    seeded,
    issue,
    named,
  };
};
