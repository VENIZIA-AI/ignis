import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GithubRelease, GithubReleaseConstants } from './github-release';
import { ReleaseKinds } from './release-kind';
import type { IReleasePlanSummary } from './release-kind';

/**
 * What a stable of a project with version folders (`knowledge.migrationFrom` is a version) needs of its changelog, read
 * by the plan job: the folder of the version the Release is made for, not yet released, and the previous stable tag the
 * history check of the `scripts` job measures from. The version is the one of the last package of the plan (`core-server`
 * when it is in the plan), the package the Release is made on. Ported from VULCAN's `ReleasePlan.changelogProblems` and
 * `changelogBase` (scripts/release/plan.ts, PR 949).
 */
export class ReleaseChangelog {
  /**
   * What a stable of a project with version folders needs that it lacks: its folder, and a folder that is not yet
   * released. A project with no manifest, or that has not adopted the folders, needs nothing. `healing` is a run that
   * continues one which already wrote the release commit of that package, and so already dated the folder: it needs
   * the folder, and accepts the date.
   */
  static problems(opts: { cwd: string; version: string; healing: boolean }): string[] {
    if (!existsSync(join(opts.cwd, GithubReleaseConstants.MANIFEST))) {
      return [];
    }

    const { changelogs: folder, migrationFrom: from } = GithubRelease.manifestOf({ cwd: opts.cwd });

    if (from === undefined || !/^\d+\.\d+\.\d+$/.test(from)) {
      return [];
    }

    const log = join(opts.cwd, folder, opts.version, 'log.md');

    if (!existsSync(log)) {
      return [
        `the stable ${opts.version} has no version folder: write ${folder}/${opts.version}/log.md before releasing it`,
      ];
    }

    return !opts.healing && /^released:/m.test(readFileSync(log, 'utf8'))
      ? [`${folder}/${opts.version}/log.md already says released: a stable is released once`]
      : [];
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
   * What the plan job says about the changelog of a plan: nothing for a prerelease. For a stable, the problems and the
   * base tag, from the last package of the plan; `versions` are the versions on the dispatched commit (`dir` -> version),
   * which say whether the run is the continuation of one that already made that package's release commit.
   */
  static ofPlan(opts: {
    cwd: string;
    plan: IReleasePlanSummary;
    versions: ReadonlyMap<string, string>;
  }): { problems: string[]; base: string } {
    const last = opts.plan.targets.at(-1);

    if (opts.plan.kind !== ReleaseKinds.STABLE || last === undefined) {
      return { problems: [], base: '' };
    }

    return {
      problems: ReleaseChangelog.problems({
        cwd: opts.cwd,
        version: last.target,
        healing: opts.versions.get(last.name) === last.target,
      }),
      base: ReleaseChangelog.base({ cwd: opts.cwd, dir: last.name, version: last.target }),
    };
  }
}
