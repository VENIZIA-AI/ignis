/**
 * Copied from VULCAN (scripts/release/sync-pr.ts at fe4c6771, VENIZIA-AI/vulcan) with two changes: IGNIS releases a
 * tag per package (`kernel-v0.4.9-1`), so the version is read from the package the tag names, and the branch names
 * are local constants. The `Closes #N` list of the pull request is not here yet.
 *
 * The Sync PR of the release flow: `main` takes the exact commit of the prerelease BANA gated, never whatever
 * `develop` has become since.
 *
 *   bun scripts/release/sync-pr.ts open   --tag <prerelease tag> [--dry-run]
 *   bun scripts/release/sync-pr.ts verify --tag <prerelease tag>
 *
 * `open` checks the tag (a prerelease, on develop's history, with main inside its history), pushes the branch
 * `sync/<tag>` at the tag's commit and opens the pull request into `main` from it. The owner merges it; this
 * script never merges. `verify` runs after the merge: the tree of `main` must equal the tree of the tag.
 *
 * It pushes a branch and opens a pull request: run it on the owner's word.
 */
import { MergeBackConstants, ReleaseMergeBack } from './merge-back';
import { ReleaseOrder } from './release-constants';

export interface ISyncCheck {
  /** The commit the tag points at. */
  commit: string;
  /** The version in `packages/<package of the tag>/package.json` at that commit. */
  version: string;
  /** Subjects of the commits the merge brings to `main`, newest first. */
  subjects: string[];
  /** Why the Sync cannot be cut from this tag; empty when it can. */
  problems: string[];
}

export class ReleaseSyncPr {
  static readonly BRANCH_PREFIX = 'sync/';
  static readonly DEVELOP = 'develop';
  static readonly MAIN = 'main';

  /** The `package.json` of the package a tag `<folder>-v<version>` is of, or `undefined` for any other name. */
  static versionFileOf(opts: { tag: string }): string | undefined {
    const folder = opts.tag.split('-v')[0];

    return ReleaseOrder.isKnown(folder) && opts.tag.startsWith(`${folder}-v`)
      ? `packages/${folder}/package.json`
      : undefined;
  }

  static branchOf(opts: { tag: string }): string {
    return `${ReleaseSyncPr.BRANCH_PREFIX}${opts.tag}`;
  }

  /** What the tag must be for a Sync to be cut from it. */
  static check(opts: { cwd: string; tag: string; main: string; develop: string }): ISyncCheck {
    const { cwd, tag } = opts;
    const peeled = ReleaseMergeBack.git({
      cwd,
      args: ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`],
    });

    if (peeled.status !== 0) {
      return {
        commit: '',
        version: '',
        subjects: [],
        problems: [`${tag} is not a tag here (a tag name, not a branch or a commit)`],
      };
    }

    const commit = peeled.stdout.trim();
    const problems: string[] = [];
    const versionFile = ReleaseSyncPr.versionFileOf({ tag });

    if (versionFile === undefined) {
      return {
        commit,
        version: '',
        subjects: [],
        problems: [`${tag} is not the tag of a package of this repository (<folder>-v<version>)`],
      };
    }

    const shown = ReleaseMergeBack.git({
      cwd,
      args: ['show', `${commit}:${versionFile}`],
    });
    const version =
      shown.status === 0 ? (ReleaseMergeBack.versionOf({ text: shown.stdout }) ?? '') : '';

    if (!version.includes('-')) {
      problems.push(
        `${tag} is at version '${version}', which is not a prerelease: a Sync is cut from a gated prerelease`,
      );
    }

    const isAncestor = (pair: { ancestor: string; of: string }): boolean =>
      ReleaseMergeBack.git({ cwd, args: ['merge-base', '--is-ancestor', pair.ancestor, pair.of] })
        .status === 0;

    if (!isAncestor({ ancestor: commit, of: opts.develop })) {
      problems.push(`${tag} (${commit.slice(0, 7)}) is not in the history of ${opts.develop}`);
    }

    if (!isAncestor({ ancestor: opts.main, of: commit })) {
      problems.push(
        `${opts.main} holds commits that ${tag} lacks: merge ${opts.main} back into develop first, or the Sync would not be a plain merge of the tag`,
      );
    }

    const subjects = ReleaseMergeBack.git({
      cwd,
      args: ['log', '--format=%s', `${opts.main}..${commit}`],
    })
      .stdout.split('\n')
      .filter((subject) => subject !== '');

    return { commit, version, subjects, problems };
  }

  static titleOf(opts: { version: string }): string {
    return `Sync main: prerelease ${opts.version}`;
  }

  static bodyOf(opts: {
    tag: string;
    version: string;
    commit: string;
    subjects: string[];
  }): string {
    return [
      `Sync main with the prerelease ${opts.version}: the exact commit of the tag \`${opts.tag}\` (${opts.commit.slice(0, 7)}), not the tip of develop.`,
      'Merge with a plain merge commit. After the merge the tree of main equals the tree of the tag (`bun scripts/release/sync-pr.ts verify`).',
      '',
      `Brings ${opts.subjects.length} commit${opts.subjects.length === 1 ? '' : 's'}:`,
      '',
      // In a fence, so a subject cannot ping anyone, close an issue or break the markdown.
      '```text',
      ...opts.subjects.map((subject) => subject.replaceAll('```', "'''")),
      '```',
      '',
    ].join('\n');
  }

  /** The tree of main against the tree of the tag, after the merge. */
  static verify(opts: { cwd: string; tag: string; main: string }): string[] {
    const treeOf = (spec: { ref: string }): string =>
      ReleaseMergeBack.git({
        cwd: opts.cwd,
        args: ['rev-parse', `${spec.ref}^{tree}`],
      }).stdout.trim();
    const main = treeOf({ ref: opts.main });
    const tagged = treeOf({ ref: `refs/tags/${opts.tag}` });

    return main !== '' && main === tagged
      ? []
      : [
          `the tree of ${opts.main} (${main.slice(0, 7)}) is not the tree of ${opts.tag} (${tagged.slice(0, 7)})`,
        ];
  }

  static main(opts: {
    args: string[];
    env: Record<string, string | undefined>;
    /** The directory git runs in; the process's own when absent. */
    cwd?: string;
  }): number {
    const [command] = opts.args;
    const tag = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--tag' });
    const cwd = opts.cwd ?? process.cwd();

    if ((command !== 'open' && command !== 'verify') || tag === undefined) {
      console.error('sync-pr: open|verify --tag <prerelease tag> [--dry-run]');

      return 2;
    }

    ReleaseMergeBack.git({
      cwd,
      args: ['fetch', '--quiet', '--tags', 'origin', ReleaseSyncPr.MAIN, ReleaseSyncPr.DEVELOP],
    });

    if (command === 'verify') {
      const problems = ReleaseSyncPr.verify({ cwd, tag, main: MergeBackConstants.DEFAULT_MAIN });

      problems.forEach((problem) => console.error(`ERROR | ${problem}`));

      if (problems.length === 0) {
        console.log(`sync-pr: the tree of main is the tree of ${tag}`);
      }

      return problems.length === 0 ? 0 : 1;
    }

    const checked = ReleaseSyncPr.check({
      cwd,
      tag,
      main: MergeBackConstants.DEFAULT_MAIN,
      develop: MergeBackConstants.DEFAULT_DEVELOP,
    });

    checked.problems.forEach((problem) => console.error(`ERROR | ${problem}`));

    if (checked.problems.length > 0) {
      return 1;
    }

    const branch = ReleaseSyncPr.branchOf({ tag });
    const title = ReleaseSyncPr.titleOf({ version: checked.version });
    const body = ReleaseSyncPr.bodyOf({ tag, ...checked });

    console.log(`sync-pr: ${branch} at ${checked.commit}\nsync-pr: ${title}\n${body}`);

    if (opts.args.includes('--dry-run')) {
      return 0;
    }

    const pushed = ReleaseMergeBack.git({
      cwd,
      args: ['push', 'origin', `${checked.commit}:refs/heads/${branch}`],
    });

    if (pushed.status !== 0) {
      console.error(`ERROR | git push: ${pushed.stderr.trim()}`);

      return 1;
    }

    const created = Bun.spawnSync(
      [
        'gh',
        'pr',
        'create',
        '--base',
        ReleaseSyncPr.MAIN,
        '--head',
        branch,
        '--title',
        title,
        '--body',
        body,
      ],
      { cwd, stdout: 'inherit', stderr: 'inherit' },
    );

    return created.exitCode;
  }
}

if (import.meta.main) {
  process.exit(ReleaseSyncPr.main({ args: process.argv.slice(2), env: process.env }));
}
