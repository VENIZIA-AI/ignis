import type { TReleaseMode } from './release-constants';
import { ReleaseKinds } from './release-kind';
import { type IPlanEntry, ReleasePlanInput } from './release-plan-input';

export interface IReleaseOutcomeLine {
  /** `+` published by this run, `=` already released (skipped, or recorded without a second publish). */
  marker: '+' | '=';
  version: string;
}

/** What `release.ts` sends to GitHub and what it reads back from the run's log. */
export class ReleaseDispatch {
  static readonly WORKFLOW = 'package-release.yml';

  /**
   * Named on every dispatch. `gh workflow run` without `--ref` runs the workflow file of the repository's
   * default branch, which is `main` once that setting changes. A prerelease runs from `develop`, a stable from `main`.
   */
  static refOf(opts: { mode: TReleaseMode }): 'develop' | 'main' {
    return ReleaseKinds.branchOf({ kind: ReleaseKinds.ofMode({ mode: opts.mode }) });
  }

  /**
   * The arguments of the one `gh` call that starts the whole release. The run title `label` is sent only when there
   * is one; the plan job refuses a label that is not the one it computes (`ReleaseTargets.labelOf`).
   */
  static buildArgs(opts: {
    entries: ReadonlyArray<IPlanEntry>;
    mode: TReleaseMode;
    issue?: string;
    label?: string;
  }): string[] {
    const { entries, mode, issue, label } = opts;

    return [
      'workflow',
      'run',
      this.WORKFLOW,
      '--ref',
      this.refOf({ mode }),
      '-f',
      `plan=${ReleasePlanInput.format({ entries })}`,
      '-f',
      `build_mode=${mode}`,
      ...(issue ? ['-f', `issue=${issue}`] : []),
      ...(label ? ['-f', `label=${label}`] : []),
    ];
  }

  /** The plan as `--plan <value>`, printed so that a stopped run is continued by re-sending it unchanged. */
  static planFlag(opts: { entries: ReadonlyArray<IPlanEntry> }): string {
    return `--plan ${ReleasePlanInput.format({ entries: opts.entries })}`;
  }

  /**
   * The `+ name@version` (published now) or `= name@version` (already released) line of each package in the
   * log of the run. The log is the proof, not the registry: its metadata shows a new version minutes late.
   */
  static readOutcomes(opts: {
    log: string;
    packageNames: ReadonlyArray<string>;
  }): Map<string, IReleaseOutcomeLine> {
    const found = new Map<string, IReleaseOutcomeLine>();
    const lines = opts.log.split('\n');

    for (const name of opts.packageNames) {
      const escaped = name.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const pattern = new RegExp(`(?:^|\\s)([+=]) ${escaped}@(\\S+)\\s*$`);

      for (const line of lines) {
        const match = pattern.exec(line);
        if (match) {
          found.set(name, { marker: match[1] as '+' | '=', version: match[2] });
          break;
        }
      }
    }

    return found;
  }
}
