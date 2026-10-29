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
 * and checked to differ from `develop`'s only in workspace versions). Anything else stops the merge, with the
 * checkout back as it was, and the reason is printed.
 */
import {
  appendFileSync,
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

        if (file.split('/').pop() !== MergeBackConstants.PACKAGE_FILE) {
          result.problems.push(`${file}: a conflict that is not the version of a package.json`);
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

        const resolution = ReleaseMergeBack.resolveVersionConflict({
          base,
          ours,
          theirs,
          scratchRoot: opts.scratchRoot,
        });

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
