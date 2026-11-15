/**
 * Copied from VULCAN (scripts/release/merge-back.ts at fe4c6771, VENIZIA-AI/vulcan, unchanged since) so that this
 * repository's release runs a file of its own. IGNIS uses `trial --versions <dir=v,...> --lock keep`: its release
 * commits touch `package.json` only. A change to the rule is made in VULCAN first and copied here.
 *
 * The merge back of a stable release: `main`, which now holds the release commit, flows into `develop`.
 *
 *   bun scripts/release/merge-back.ts trial (--version <v> | --versions <dir=v,...>) [--lock keep|regenerate]
 *     [--main <ref>] [--develop <ref>]
 *   bun scripts/release/merge-back.ts apply --from <commit> [--repo <worktree of develop>] [--message <text>]
 *
 * `trial` runs in the plan job, before anyone is asked to approve: in throwaway worktrees it makes the release
 * commit the run would make, merges it into `develop`, and reports. `--version` puts one version on every
 * package (a train); `--versions` gives each listed `packages/<dir>` its own and leaves the rest; `--lock keep`
 * leaves bun.lock out of the release commit. `apply` runs in the publish job, in a worktree of `develop` named
 * by `--repo`: it makes the same merge and commits it, and the workflow pushes. The process itself runs in the
 * checkout of the release, so no file of `develop` (a bunfig.toml, a .env) configures it.
 *
 * A conflict is resolved only when it is the `version` field of a `package.json` (the greater version wins, so a
 * stable `0.4.9` beats `0.4.9-3` and `0.4.10-0` beats `0.4.9`) or `bun.lock` (regenerated, never merged by hand,
 * and checked to differ from `develop`'s only in workspace versions) or a version folder's `log.md` (the `released:`
 * line the release commit added; resolved when it is the only difference). Anything else stops the merge, with the
 * checkout back as it was, and the reason is printed.
 */
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class MergeBackConstants {
  /** Stands for the version while a three-way merge of a `package.json` runs, so only other lines can conflict. */
  static readonly PLACEHOLDER = '0.0.0-merge-back';

  /** The top-level `version` of a `package.json`, as the repository formats it (two-space indent). */
  static readonly VERSION_LINE = /^( {2}"version": ")([^"]+)(")/m;

  /** A line of `bun.lock` that may change when only workspace versions did. */
  static readonly LOCK_VERSION_LINE = /^\s*"version": "[^"]+",?$/;

  static readonly LOCK_FILE = 'bun.lock';
  /** `<changelogs>/<X.Y.Z>/log.md`: the only `log.md` whose `released:` line is resolved. */
  static readonly FOLDER_LOG = /(?:^|\/)\d+\.\d+\.\d+\/log\.md$/;
  static readonly MANIFEST = '.agents/vulcan.manifest.json';
  static readonly LEADING_DIR = 'core-server';
  static readonly PACKAGE_FILE = 'package.json';
  static readonly DEFAULT_MAIN = 'origin/main';
  static readonly DEFAULT_DEVELOP = 'origin/develop';

  /** The identity of the commits this script makes: the release's own, never a person's. */
  static readonly IDENTITY = [
    '-c',
    'user.name=venizia-ci',
    '-c',
    'user.email=developer@venizia.ai',
  ];
}

export interface IGitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface IMergeBackResult {
  /** `package.json` files whose conflict was only the version. */
  resolved: string[];
  lockRegenerated: boolean;
  /** Why the merge stopped; empty when it went through. */
  problems: string[];
  /** The merge commit, when `commit` was asked for and the merge went through. */
  head?: string;
}

/**
 * The stamp of a stable release lives in this file because the publish job copies `merge-back.ts` alone to the runner
 * and runs it there: it has no relative import, and `stamp-release.ts`, the plan job and the trial all take these from it.
 */
export class ReleaseStampConstants {
  static readonly VERSION = /^\d+\.\d+\.\d+$/;
  static readonly DATE = /^\d{4}-\d{2}-\d{2}$/;
  static readonly FRONT_MATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/;
  static readonly RELEASED = /^released:[ \t]*(.*?)[ \t]*$/m;
  static readonly USAGE = 'stamp-release: --version <X.Y.Z> --date <YYYY-MM-DD>';
}

/** The text of a version folder's `log.md` as the stamp reads and writes it: pure functions. */
export class ReleaseStampText {
  /**
   * `text` with `released: <date>` as the last line of its frontmatter. `undefined` when it already says that date
   * (nothing to write); an error when it says another, or has no frontmatter to put the line in.
   */
  static stamped(opts: { text: string; date: string }): string | undefined {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    if (matched === null) {
      throw new Error('log.md has no frontmatter to write released: into');
    }

    const existing = ReleaseStampConstants.RELEASED.exec(matched[2])?.[1];

    if (existing !== undefined) {
      if (existing === opts.date) {
        return undefined;
      }

      throw new Error(`log.md already says released: ${existing}; a released folder is frozen`);
    }

    const lineBreak = matched[1].endsWith('\r\n') ? '\r\n' : '\n';

    return `${matched[1]}${matched[2]}${lineBreak}released: ${opts.date}${matched[3]}${opts.text.slice(matched[0].length)}`;
  }

  /** The date the frontmatter of `text` says it was released on; `undefined` when it says none (the body is not read). */
  static releasedOf(opts: { text: string }): string | undefined {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    return matched === null
      ? undefined
      : ReleaseStampConstants.RELEASED.exec(matched[2])?.[1] || undefined;
  }

  /** `text` without the `released:` line of its frontmatter; unchanged when it has none. */
  static withoutReleased(opts: { text: string }): string {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    if (matched === null) {
      return opts.text;
    }

    const lineBreak = matched[1].endsWith('\r\n') ? '\r\n' : '\n';
    const kept = matched[2]
      .split(/\r?\n/)
      .filter((line) => !/^released:/.test(line))
      .join(lineBreak);

    return `${matched[1]}${kept}${matched[3]}${opts.text.slice(matched[0].length)}`;
  }

  /**
   * Why the stamp cannot be written into `text`, or `undefined` when it can: it runs the stamp itself, so the plan
   * reports exactly what the release commit would. `healing` is a run that continues one which already dated the
   * folder (its release commit exists, so the loop stamps nothing): a date there is accepted.
   */
  static problemOf(opts: { text: string; healing: boolean; date: string }): string | undefined {
    try {
      const stamped = ReleaseStampText.stamped({ text: opts.text, date: opts.date });

      return !opts.healing && stamped === undefined
        ? `already says released: ${opts.date}; a released folder is frozen`
        : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return opts.healing && message.includes('already says released')
        ? undefined
        : message.replace(/^log\.md /, '');
    }
  }
}

export class ReleaseMergeBack {
  static git(opts: { cwd: string; args: string[] }): IGitResult {
    const child = Bun.spawnSync(['git', ...opts.args], {
      cwd: opts.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    return {
      status: child.exitCode,
      stdout: child.stdout.toString(),
      stderr: child.stderr.toString(),
    };
  }

  /** Like `git`, but a failure is an exception: for a step the rest cannot go on without. */
  static mustGit(opts: { cwd: string; args: string[] }): string {
    const result = ReleaseMergeBack.git(opts);

    if (result.status !== 0) {
      throw new Error(`git ${opts.args.join(' ')}: ${result.stderr.trim()}`);
    }

    return result.stdout.trim();
  }

  static versionOf(opts: { text: string }): string | undefined {
    return MergeBackConstants.VERSION_LINE.exec(opts.text)?.[2];
  }

  static withVersion(opts: { text: string; version: string }): string {
    return opts.text.replace(
      MergeBackConstants.VERSION_LINE,
      (_match, before: string, _version: string, after: string) =>
        `${before}${opts.version}${after}`,
    );
  }

  /**
   * The text a conflicted `package.json` resolves to, or the reason it cannot. The three sides get one
   * placeholder version and are merged by `git merge-file`: clean means the version was the only difference.
   */
  static resolveVersionConflict(opts: {
    base: string;
    ours: string;
    theirs: string;
    scratchRoot: string;
  }): { text?: string; problem?: string } {
    const oursVersion = ReleaseMergeBack.versionOf({ text: opts.ours });
    const theirsVersion = ReleaseMergeBack.versionOf({ text: opts.theirs });

    if (
      oursVersion === undefined ||
      theirsVersion === undefined ||
      ReleaseMergeBack.versionOf({ text: opts.base }) === undefined
    ) {
      return { problem: 'a side has no top-level version line in the expected format' };
    }

    const directory = mkdtempSync(join(opts.scratchRoot, 'merge-back-'));

    try {
      const sides = { ours: opts.ours, base: opts.base, theirs: opts.theirs };

      for (const [name, text] of Object.entries(sides)) {
        writeFileSync(
          join(directory, name),
          ReleaseMergeBack.withVersion({ text, version: MergeBackConstants.PLACEHOLDER }),
        );
      }

      const merged = ReleaseMergeBack.git({
        cwd: directory,
        args: ['merge-file', '-p', 'ours', 'base', 'theirs'],
      });

      if (merged.status !== 0) {
        return { problem: 'its other lines conflict too, not only the version' };
      }

      const greater =
        Bun.semver.order(oursVersion, theirsVersion) >= 0 ? oursVersion : theirsVersion;

      return { text: ReleaseMergeBack.withVersion({ text: merged.stdout, version: greater }) };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  /**
   * The text a conflicted version folder `log.md` resolves to, or the reason it cannot: the release commit added
   * `released: <date>` as the last line of the frontmatter, and `develop` edited the lines around it. The three sides
   * lose that line and are merged by `git merge-file`: clean means the stamp was the only difference, and the line is
   * written back. A folder `develop` already dated differently, or released before the stamp, is not resolved.
   */
  static resolveStampConflict(opts: {
    base: string;
    ours: string;
    theirs: string;
    scratchRoot: string;
  }): { text?: string; problem?: string } {
    const dates = [opts.base, opts.ours, opts.theirs].map((text) =>
      ReleaseStampText.releasedOf({ text }),
    );
    const [base, ours, theirs] = dates;
    const date = theirs ?? ours;

    if (base !== undefined) {
      return { problem: 'the base already says released:, a released folder is frozen' };
    }

    if (date === undefined) {
      return { problem: 'neither side has a released: line, so it is not a stamp conflict' };
    }

    if (ours !== undefined && theirs !== undefined && ours !== theirs) {
      return { problem: `the sides date the folder differently (${ours}, ${theirs})` };
    }

    const directory = mkdtempSync(join(opts.scratchRoot, 'merge-back-'));

    try {
      const sides = { ours: opts.ours, base: opts.base, theirs: opts.theirs };

      for (const [name, text] of Object.entries(sides)) {
        writeFileSync(join(directory, name), ReleaseStampText.withoutReleased({ text }));
      }

      const merged = ReleaseMergeBack.git({
        cwd: directory,
        args: ['merge-file', '-p', 'ours', 'base', 'theirs'],
      });

      if (merged.status !== 0) {
        return { problem: 'its other lines conflict too, not only the released: line' };
      }

      return { text: ReleaseStampText.stamped({ text: merged.stdout, date }) ?? merged.stdout };
    } catch (error) {
      return { problem: error instanceof Error ? error.message : String(error) };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  /** Why a regenerated lockfile may not replace `develop`'s: a line other than a workspace version moved. */
  static lockProblems(opts: { before: string; after: string }): string[] {
    const before = opts.before.split('\n');
    const after = opts.after.split('\n');

    if (before.length !== after.length) {
      return [`${MergeBackConstants.LOCK_FILE} changed in length, not only in workspace versions`];
    }

    const problems: string[] = [];

    before.forEach((line, index) => {
      const other = after[index];

      if (
        line !== other &&
        !(
          MergeBackConstants.LOCK_VERSION_LINE.test(line) &&
          MergeBackConstants.LOCK_VERSION_LINE.test(other)
        )
      ) {
        problems.push(`${MergeBackConstants.LOCK_FILE} line ${index + 1} changed: ${other.trim()}`);
      }
    });

    return problems;
  }

  /**
   * Merges `from` into the checkout at `cwd` (a clean worktree of `develop`). With `commit` the merge is
   * committed when it goes through; without it, or when it stops, the checkout is put back as it was.
   */
  static mergeInto(opts: {
    cwd: string;
    from: string;
    scratchRoot: string;
    commit?: { message: string };
  }): IMergeBackResult {
    const { cwd } = opts;
    const result: IMergeBackResult = { resolved: [], lockRegenerated: false, problems: [] };
    const merge = ReleaseMergeBack.git({
      cwd,
      args: [...MergeBackConstants.IDENTITY, 'merge', '--no-ff', '--no-commit', opts.from],
    });

    if (merge.status !== 0) {
      const unmerged = ReleaseMergeBack.git({
        cwd,
        args: ['diff', '--name-only', '--diff-filter=U'],
      })
        .stdout.split('\n')
        .filter((file) => file !== '');

      if (unmerged.length === 0) {
        result.problems.push(
          `git merge ${opts.from}: ${merge.stderr.trim() || merge.stdout.trim()}`,
        );
      }

      let lockConflicted = false;

      for (const file of unmerged) {
        if (file === MergeBackConstants.LOCK_FILE) {
          lockConflicted = true;
          continue;
        }

        const name = file.split('/').pop();
        const isFolderLog = MergeBackConstants.FOLDER_LOG.test(file);

        if (name !== MergeBackConstants.PACKAGE_FILE && !isFolderLog) {
          result.problems.push(
            `${file}: a conflict that is not the version of a package.json or the released: line of a version folder's log.md`,
          );
          continue;
        }

        const readStage = (opts: { stage: number }): string | undefined => {
          const shown = ReleaseMergeBack.git({ cwd, args: ['show', `:${opts.stage}:${file}`] });

          return shown.status === 0 ? shown.stdout : undefined;
        };
        const [base, ours, theirs] = [
          readStage({ stage: 1 }),
          readStage({ stage: 2 }),
          readStage({ stage: 3 }),
        ];

        if (base === undefined || ours === undefined || theirs === undefined) {
          result.problems.push(`${file}: added or deleted on one side, not a version conflict`);
          continue;
        }

        const resolution = (
          isFolderLog
            ? ReleaseMergeBack.resolveStampConflict
            : ReleaseMergeBack.resolveVersionConflict
        )({ base, ours, theirs, scratchRoot: opts.scratchRoot });

        if (resolution.text === undefined) {
          result.problems.push(`${file}: ${resolution.problem}`);
          continue;
        }

        writeFileSync(join(cwd, file), resolution.text);
        ReleaseMergeBack.mustGit({ cwd, args: ['add', file] });
        result.resolved.push(file);
      }

      if (result.problems.length === 0 && lockConflicted) {
        ReleaseMergeBack.regenerateLock({ cwd, result });
      }
    }

    if (result.problems.length === 0 && opts.commit !== undefined) {
      // Nothing is being merged when `from` is already in the checkout: there is no merge to commit.
      if (
        ReleaseMergeBack.git({ cwd, args: ['rev-parse', '-q', '--verify', 'MERGE_HEAD'] })
          .status === 0
      ) {
        ReleaseMergeBack.mustGit({
          cwd,
          args: [...MergeBackConstants.IDENTITY, 'commit', '--no-edit', '-m', opts.commit.message],
        });
      }

      result.head = ReleaseMergeBack.mustGit({ cwd, args: ['rev-parse', 'HEAD'] });
    } else {
      ReleaseMergeBack.git({ cwd, args: ['merge', '--abort'] });
    }

    return result;
  }

  /** `bun.lock` is taken from `develop`, regenerated for the merged package.json files, and checked. */
  static regenerateLock(opts: { cwd: string; result: IMergeBackResult }): void {
    const { cwd, result } = opts;

    ReleaseMergeBack.mustGit({
      cwd,
      args: ['checkout', '--ours', '--', MergeBackConstants.LOCK_FILE],
    });

    const before = readFileSync(join(cwd, MergeBackConstants.LOCK_FILE), 'utf8');
    const install = Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (install.exitCode !== 0) {
      result.problems.push(
        `bun install --lockfile-only failed: ${install.stderr.toString().trim().split('\n').pop()}`,
      );

      return;
    }

    const problems = ReleaseMergeBack.lockProblems({
      before,
      after: readFileSync(join(cwd, MergeBackConstants.LOCK_FILE), 'utf8'),
    });

    if (problems.length > 0) {
      result.problems.push(...problems);

      return;
    }

    ReleaseMergeBack.mustGit({ cwd, args: ['add', MergeBackConstants.LOCK_FILE] });
    result.lockRegenerated = true;
  }

  /** The `package.json` of every package under `packages/`, repository-relative. */
  static packageFilesOf(opts: { cwd: string }): string[] {
    return readdirSync(join(opts.cwd, 'packages'))
      .map((directory) => join('packages', directory, MergeBackConstants.PACKAGE_FILE))
      .filter(
        (file) =>
          ReleaseMergeBack.git({ cwd: opts.cwd, args: ['cat-file', '-e', `HEAD:${file}`] })
            .status === 0,
      );
  }

  /**
   * The merge the run would make, without touching any branch: a worktree of `main` gets the release commit
   * (every package at `version`, the lockfile regenerated), a worktree of `develop` merges it, and both go.
   * Returns the head of `develop` the trial read, so the publish job can tell whether `develop` moved.
   */
  static trial(opts: {
    cwd: string;
    /** One version for every package (a train). */
    version?: string;
    /** A version per package directory, for a repository whose packages release apart; the others stay as they are. */
    versions?: Record<string, string>;
    main: string;
    develop: string;
    scratchRoot: string;
    /** `keep` leaves bun.lock out of the release commit, for a repository whose release never touches it. */
    lock?: 'keep' | 'regenerate';
    /** The date the release commit writes into the version folder; today (UTC) when absent. */
    date?: string;
  }): IMergeBackResult & { developHead: string } {
    if (opts.version === undefined && opts.versions === undefined) {
      throw new Error('trial needs version or versions');
    }

    const label =
      opts.version ??
      Object.entries(opts.versions ?? {})
        .map(([directory, version]) => `${directory}@${version}`)
        .join(' ');
    const root = mkdtempSync(join(opts.scratchRoot, 'merge-trial-'));
    const releaseTree = join(root, 'release');
    const mergeTree = join(root, 'merge');
    const developHead = ReleaseMergeBack.mustGit({
      cwd: opts.cwd,
      args: ['rev-parse', `${opts.develop}^{commit}`],
    });

    try {
      ReleaseMergeBack.mustGit({
        cwd: opts.cwd,
        args: ['worktree', 'add', '--detach', releaseTree, opts.main],
      });

      const touched = new Set<string>();

      for (const file of ReleaseMergeBack.packageFilesOf({ cwd: releaseTree })) {
        const directory = file.split('/')[1];
        const version = opts.versions === undefined ? opts.version : opts.versions[directory];

        if (version === undefined) {
          continue;
        }

        const current = readFileSync(join(releaseTree, file), 'utf8');

        // A file the version line of which this script cannot find would pass the trial unchanged and stop the
        // merge after the publish: say so here, before the approval.
        if (ReleaseMergeBack.versionOf({ text: current }) === undefined) {
          return {
            resolved: [],
            lockRegenerated: false,
            problems: [`${file} has no top-level "version" line indented by two spaces`],
            developHead,
          };
        }

        touched.add(directory);
        writeFileSync(
          join(releaseTree, file),
          ReleaseMergeBack.withVersion({ text: current, version }),
        );
      }

      const unknown = Object.keys(opts.versions ?? {}).filter(
        (directory) => !touched.has(directory),
      );

      if (unknown.length > 0) {
        return {
          resolved: [],
          lockRegenerated: false,
          problems: [
            `no package directory named ${unknown.join(', ')} under packages/ on ${opts.main}`,
          ],
          developHead,
        };
      }

      const stampProblem = ReleaseMergeBack.stampTrial({
        root: releaseTree,
        version: opts.versions?.[MergeBackConstants.LEADING_DIR],
        date: opts.date ?? new Date().toISOString().slice(0, 10),
      });

      if (stampProblem !== undefined) {
        return { resolved: [], lockRegenerated: false, problems: [stampProblem], developHead };
      }

      const install =
        (opts.lock ?? 'regenerate') === 'regenerate'
          ? Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
              cwd: releaseTree,
              stdout: 'pipe',
              stderr: 'pipe',
            })
          : undefined;

      if (install !== undefined && install.exitCode !== 0) {
        return {
          resolved: [],
          lockRegenerated: false,
          problems: [
            `bun install --lockfile-only on main failed: ${install.stderr.toString().trim().split('\n').pop()}`,
          ],
          developHead,
        };
      }

      ReleaseMergeBack.mustGit({ cwd: releaseTree, args: ['add', '-A'] });
      ReleaseMergeBack.mustGit({
        cwd: releaseTree,
        args: [
          ...MergeBackConstants.IDENTITY,
          'commit',
          '--allow-empty',
          '-m',
          `trial: release ${label}`,
        ],
      });

      const releaseCommit = ReleaseMergeBack.mustGit({
        cwd: releaseTree,
        args: ['rev-parse', 'HEAD'],
      });

      ReleaseMergeBack.mustGit({
        cwd: opts.cwd,
        args: ['worktree', 'add', '--detach', mergeTree, developHead],
      });

      return {
        ...ReleaseMergeBack.mergeInto({
          cwd: mergeTree,
          from: releaseCommit,
          scratchRoot: opts.scratchRoot,
        }),
        developHead,
      };
    } finally {
      for (const tree of [releaseTree, mergeTree]) {
        ReleaseMergeBack.git({ cwd: opts.cwd, args: ['worktree', 'remove', '--force', tree] });
      }

      rmSync(root, { recursive: true, force: true });
    }
  }

  /**
   * What the release commit of `core-server` writes besides the versions: `released: <date>` in its version folder, so
   * the merge the trial rehearses meets it. The loop stamps only a folder not yet dated (a repeated run of a plan whose
   * release commit exists stamps nothing), and so does this. Returns the problem when the folder cannot be stamped.
   */
  private static stampTrial(opts: {
    root: string;
    version: string | undefined;
    date: string;
  }): string | undefined {
    const manifest = join(opts.root, MergeBackConstants.MANIFEST);

    if (opts.version === undefined || !existsSync(manifest)) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    const knowledge =
      typeof parsed === 'object' && parsed !== null && 'knowledge' in parsed
        ? parsed.knowledge
        : undefined;
    const folder =
      typeof knowledge === 'object' && knowledge !== null && 'changelogs' in knowledge
        ? knowledge.changelogs
        : undefined;

    if (typeof folder !== 'string') {
      return undefined;
    }

    const file = join(opts.root, folder, opts.version, 'log.md');

    if (!existsSync(file)) {
      return undefined;
    }

    const text = readFileSync(file, 'utf8');

    if (ReleaseStampText.releasedOf({ text }) !== undefined) {
      return undefined;
    }

    try {
      const next = ReleaseStampText.stamped({ text, date: opts.date });

      if (next !== undefined) {
        writeFileSync(file, next);
      }

      return undefined;
    } catch (error) {
      return `${folder}/${opts.version}/log.md: ${error instanceof Error ? error.message.replace(/^log\.md /, '') : String(error)}`;
    }
  }

  static summaryOf(opts: { result: IMergeBackResult; version: string }): string {
    const { result } = opts;

    return [
      '### Merge back into develop (trial)',
      '',
      result.problems.length > 0
        ? `- Stops, before any approval: ${result.problems.join('; ')}`
        : `- Goes through for **${opts.version}**`,
      `- Version-only conflicts resolved: ${result.resolved.length === 0 ? 'none' : result.resolved.join(', ')}`,
      `- bun.lock regenerated: ${result.lockRegenerated ? 'yes' : 'no (it did not conflict)'}`,
      '',
    ].join('\n');
  }

  static flagValue(opts: { args: string[]; flag: string }): string | undefined {
    const index = opts.args.indexOf(opts.flag);
    const value = index === -1 ? undefined : opts.args[index + 1];

    return value === undefined || value.startsWith('--') ? undefined : value;
  }

  static main(opts: {
    args: string[];
    env: Record<string, string | undefined>;
    /** The directory the git commands of `trial` run in; the process's own when absent. */
    cwd?: string;
  }): number {
    const [command] = opts.args;
    const scratchRoot = opts.env['RUNNER_TEMP'] ?? tmpdir();
    const cwd = opts.cwd ?? process.cwd();

    try {
      if (command === 'trial') {
        const version = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--version' });
        const listed = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--versions' });
        const lock =
          ReleaseMergeBack.flagValue({ args: opts.args, flag: '--lock' }) ?? 'regenerate';

        if ((version === undefined) === (listed === undefined)) {
          console.error(
            'merge-back trial: exactly one of --version <v> or --versions <dir=v,...> is required',
          );

          return 2;
        }

        if (lock !== 'keep' && lock !== 'regenerate') {
          console.error('merge-back trial: --lock is keep or regenerate');

          return 2;
        }

        const pairs = listed?.split(',').map((pair) => pair.split('=')) ?? [];

        if (pairs.some(([directory, given]) => !directory || !given)) {
          console.error('merge-back trial: --versions is <dir=version>,<dir=version>');

          return 2;
        }

        const versions = listed === undefined ? undefined : Object.fromEntries(pairs);

        const result = ReleaseMergeBack.trial({
          cwd,
          version,
          versions,
          lock,
          main:
            ReleaseMergeBack.flagValue({ args: opts.args, flag: '--main' }) ??
            MergeBackConstants.DEFAULT_MAIN,
          develop:
            ReleaseMergeBack.flagValue({ args: opts.args, flag: '--develop' }) ??
            MergeBackConstants.DEFAULT_DEVELOP,
          scratchRoot,
          date: ReleaseMergeBack.flagValue({ args: opts.args, flag: '--date' }),
        });

        for (const problem of result.problems) {
          console.error(`ERROR | merge back: ${problem}`);
        }

        console.log(
          `merge-back: ${result.problems.length === 0 ? 'goes through' : 'stops'} (resolved: ${result.resolved.join(', ') || 'none'}; lock regenerated: ${result.lockRegenerated})`,
        );

        const output = opts.env['GITHUB_OUTPUT'];
        const summary = opts.env['GITHUB_STEP_SUMMARY'];

        if (output !== undefined) {
          appendFileSync(output, `develop_sha=${result.developHead}\n`);
        }

        if (summary !== undefined) {
          appendFileSync(
            summary,
            ReleaseMergeBack.summaryOf({ result, version: version ?? listed ?? '' }),
          );
        }

        return result.problems.length === 0 ? 0 : 1;
      }

      if (command === 'apply') {
        const from = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--from' });

        if (from === undefined) {
          console.error('merge-back apply: --from <commit> is required');

          return 2;
        }

        const result = ReleaseMergeBack.mergeInto({
          cwd: ReleaseMergeBack.flagValue({ args: opts.args, flag: '--repo' }) ?? cwd,
          from,
          scratchRoot,
          commit: {
            message:
              ReleaseMergeBack.flagValue({ args: opts.args, flag: '--message' }) ??
              `Merge ${from} into develop`,
          },
        });

        for (const problem of result.problems) {
          console.error(`ERROR | merge back: ${problem}`);
        }

        if (result.head !== undefined) {
          console.log(`merge-back: committed ${result.head}`);
        }

        return result.problems.length === 0 ? 0 : 1;
      }
    } catch (error) {
      console.error(`ERROR | ${error instanceof Error ? error.message : String(error)}`);

      return 1;
    }

    console.error(
      'merge-back: trial (--version <v> | --versions <dir=v,...>) [--lock keep|regenerate] | apply --from <commit> [--repo <worktree>]',
    );

    return 2;
  }
}

if (import.meta.main) {
  process.exit(ReleaseMergeBack.main({ args: process.argv.slice(2), env: process.env }));
}
