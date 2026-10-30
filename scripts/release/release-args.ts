import { ReleaseModes, type TReleaseMode } from './release-constants';

export type { TReleaseMode };

export interface IReleaseArgs {
  isDryRun: boolean;
  isConfirmed: boolean;
  mode: TReleaseMode;
  /** The plan to send as it is (`name@from,...`), printed by an earlier dispatch: continues a run that stopped. */
  plan?: string;
  issue?: string;
  /** The package names given on the command line, in the order given. */
  named: Array<string>;
}

export class ReleaseArgs {
  /** Parses the command line of scripts/release/release.ts. Throws on an `--issue` that is not a number. */
  static parse(opts: { args: ReadonlyArray<string> }): IReleaseArgs {
    const { args } = opts;
    const modeIndex = args.indexOf('--mode');
    const requestedMode = modeIndex >= 0 ? args[modeIndex + 1] : ReleaseModes.PRERELEASE;
    if (requestedMode === undefined || !ReleaseModes.isValid(requestedMode)) {
      throw new Error(
        `--mode must be one of ${[...ReleaseModes.SCHEME_SET].join(', ')}, got: ${requestedMode ?? 'nothing'}`,
      );
    }
    const mode = requestedMode;
    const planIndex = args.indexOf('--plan');
    const plan = planIndex >= 0 ? args[planIndex + 1] : undefined;
    if (planIndex >= 0 && !plan) {
      throw new Error('--plan needs name@version[,name@version...]');
    }
    const issueIndex = args.indexOf('--issue');
    const issue = issueIndex >= 0 ? args[issueIndex + 1] : undefined;
    if (issueIndex >= 0 && !/^\d+$/.test(issue ?? '')) {
      throw new Error(`--issue needs an issue number, got: ${issue ?? 'nothing'}`);
    }

    // A value is skipped by its position right after its own flag - never by its text, and never by
    // `args[-1 + 1]` when the flag is absent, which once dropped the first package name.
    const valueIndexes = new Set(
      [modeIndex, planIndex, issueIndex].filter((index) => index >= 0).map((index) => index + 1),
    );
    const named = args.filter((arg, index) => !arg.startsWith('--') && !valueIndexes.has(index));

    return {
      isDryRun: args.includes('--dry-run'),
      isConfirmed: args.includes('--yes'),
      mode,
      plan,
      issue,
      named,
    };
  }
}
