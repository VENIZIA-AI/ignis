import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GithubRelease, GithubReleaseConstants } from './github-release';
import { ReleaseKinds } from './release-kind';
import { ReleaseStampConstants, ReleaseStampText } from './merge-back';
import type { IReleasePlanSummary } from './release-kind';

/**
 * What a stable of a project with version folders (`knowledge.migrationFrom` is a version) needs of its changelog, read
 * by the plan job: the folder of the version the Release is made for, not yet released, and the previous stable tag the
 * history check of the `scripts` job measures from. The version is `core-server`'s (the leading package, the one the
 * folders are named for); a plan without it has no folder to need or to stamp. Ported from VULCAN's
 * `ReleasePlan.changelogProblems` and `changelogBase` (scripts/release/plan.ts); a change to the rule is made in VULCAN
 * first.
 */
export class ReleaseChangelog {
  /**
   * What a stable of a project with version folders needs that it lacks: its folder, and a folder that is not yet
   * released. A project with no manifest, or that has not adopted the folders, needs nothing. `healing` is a run that
   * continues one which already wrote the release commit of that package, and so already dated the folder: it needs
   * the folder, and accepts the date.
   */
  static problems(opts: {
    cwd: string;
    version: string;
    healing: boolean;
    /** The date the release commit would write; today (UTC) when absent. */
    date?: string;
  }): string[] {
    if (!existsSync(join(opts.cwd, GithubReleaseConstants.MANIFEST))) {
      return [];
    }

    const { changelogs: folder, migrationFrom: from } = GithubRelease.manifestOf({ cwd: opts.cwd });

    if (from === undefined || !ReleaseStampConstants.VERSION.test(from)) {
      return [];
    }

    const log = join(opts.cwd, folder, opts.version, 'log.md');

    if (!existsSync(log)) {
      return [
        `the stable ${opts.version} has no version folder: write ${folder}/${opts.version}/log.md before releasing it`,
      ];
    }

    // The stamp is dry-run here: a log.md it cannot be written into is refused before anything is published.
    const problem = ReleaseStampText.problemOf({
      text: readFileSync(log, 'utf8'),
      healing: opts.healing,
      date: opts.date ?? new Date().toISOString().slice(0, 10),
    });

    return problem === undefined ? [] : [`${folder}/${opts.version}/log.md ${problem}`];
  }

  /** The highest stable tag of the package below `version`: where the history check measures from; empty when there is none. */
  static base(opts: { cwd: string; dir: string; version: string }): string {
    if (!existsSync(join(opts.cwd, GithubReleaseConstants.MANIFEST))) {
      return '';
    }

    const manifest = GithubRelease.manifestOf({ cwd: opts.cwd });

    return (
      GithubRelease.previousTag({
        tags: GithubRelease.tagsOf({ cwd: opts.cwd }),
        template: GithubRelease.templateOf({ manifest, dir: opts.dir }),
        version: opts.version,
      }) ?? ''
    );
  }

  /**
   * What the plan job says about the changelog of a plan: nothing for a prerelease, and nothing for a stable without
   * `core-server` (the folders are named for its version, and it is the package the Release is made on). For a stable
   * with it, the problems and the base tag; `versions` are the versions on the dispatched commit (`dir` -> version),
   * which say whether the run continues one that already made the release commit of `core-server`.
   */
  static ofPlan(opts: {
    cwd: string;
    plan: IReleasePlanSummary;
    versions: ReadonlyMap<string, string>;
    date?: string;
  }): { problems: string[]; base: string } {
    const leading = opts.plan.targets.find(
      (target) => target.name === GithubReleaseConstants.LEADING_DIR,
    );

    if (opts.plan.kind !== ReleaseKinds.STABLE || leading === undefined) {
      return { problems: [], base: '' };
    }

    return {
      problems: ReleaseChangelog.problems({
        cwd: opts.cwd,
        version: leading.target,
        healing: opts.versions.get(leading.name) === leading.target,
        date: opts.date,
      }),
      base: ReleaseChangelog.base({ cwd: opts.cwd, dir: leading.name, version: leading.target }),
    };
  }
}
