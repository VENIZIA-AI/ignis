/**
 * The GitHub Release of a publish run: ONE Release for the run, on the tag of the last package of its plan.
 *
 *   bun scripts/release/github-release.ts create --targets <dir=version,...> --kind stable|prerelease
 *   bun scripts/release/github-release.ts backfill --tag <tag> [--yes]
 *
 * A run publishes up to nine packages, each with its own tag `<dir>-v<version>`. The Release is made on the tag of
 * the last package in release order (`core-server` when it is in the plan), so the previous tag and the newest stable
 * are read from the tags of that one package. `create` is what the workflow calls; `backfill` makes the Release of
 * one tag by hand, is a dry run without `--yes`, and is never called by the workflow. The `atlas-index` release is
 * never created, edited or moved.
 */
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReleaseMergeBack } from './merge-back';
import { ReleaseOrder } from './release-constants';
import { ReleaseKinds } from './release-kind';
import type { TReleaseKind } from './release-kind';

export class GithubReleaseConstants {
  /** The release the atlas index publishes its pairs to. */
  static readonly ATLAS_INDEX_TAG = 'atlas-index';
  static readonly MANIFEST = '.agents/vulcan.manifest.json';
  static readonly MAX_PRERELEASE_SUBJECTS = 30;
  static readonly DATED_ENTRY = /^\d{4}-\d{2}-\d{2}-.*\.md$/;
  static readonly FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
  static readonly DATE_HEADING = /^# Changelog - \d{4}-\d{2}-\d{2}\s*$/m;
  /** The badge line under an entry heading (one badge or several): a VitePress component, which a Release cannot render. */
  static readonly BADGE_LINE = /^(?:<Badge\b[^>]*\/>[ \t]*)+\r?\n?/gm;
  static readonly ISSUE_SUBJECT = /^\[#\d+\]/;
  /** The release commit the loop makes per package: `[#N] chore(<dir>): release v<version> [<mode>]`. */
  static readonly RELEASE_COMMIT_SUBJECT = /^(?:\[#\d+\] )?chore\([^)]+\): release v\d\S* \[\w+\]$/;
  static readonly TITLE_PREFIX = 'IGNIS';
  /** The package a Release is titled by its version alone and may be Latest for: GitHub has one Latest per repository. */
  static readonly LEADING_DIR = 'core-server';
  static readonly WIKI_URL = 'https://ignis.venizia.ai';
  static readonly CHANGELOG_URL = 'https://ignis.venizia.ai/changelogs/';
  /** `@word` or `@org/team` that is not part of a word, a path or a URL (`a@b`, `/@x`). */
  static readonly MENTION = /(^|[^\w`/@])@([A-Za-z0-9][\w-]*(?:\/[\w-]+)*)/g;
  /** `](/path)`: a link to the wiki as the wiki writes it; `](//host)` is not one. */
  static readonly ROOT_LINK = /\]\(\/(?!\/)/g;
  /** GitHub refuses a body of 125000 characters or more. */
  static readonly MAX_BODY_LENGTH = 120_000;
  /** The notes of a stable with no changelog entry: the changelog records what affects users, and nothing did. */
  static readonly NO_USER_CHANGES = 'No change for users of the packages in this release.';
  static readonly USAGE =
    'github-release: create --targets <dir=version,...> --kind stable|prerelease | backfill --tag <tag> [--yes]';
}

export interface IGithubReleasePackage {
  /** The npm name. */
  name: string;
  /** The folder under `packages/`; also the first part of the tag. */
  dir: string;
}

export interface IGithubReleaseManifest {
  /** The tag pattern, `<dir>-v<version>`. */
  tagPattern: string;
  changelogs: string;
  /** In the manifest's order, which is the release order. */
  packages: IGithubReleasePackage[];
}

export interface IGithubReleaseTarget {
  dir: string;
  version: string;
}

export interface IGithubReleasePackageVersion {
  name: string;
  version: string;
}

export interface IGhResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type TGh = (opts: { args: string[] }) => IGhResult;

export type TGithubReleaseState = 'created' | 'exists' | 'planned' | 'refused' | 'failed';

export interface IGithubReleaseOutcome {
  state: TGithubReleaseState;
  message: string;
}

export class GithubRelease {
  static ghOf(opts: { cwd: string }): TGh {
    return ({ args }) => {
      const child = Bun.spawnSync(['gh', ...args], {
        cwd: opts.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      return {
        status: child.exitCode,
        stdout: child.stdout.toString(),
        stderr: child.stderr.toString(),
      };
    };
  }

  static isRecord(opts: { value: unknown }): opts is { value: Record<string, unknown> } {
    return typeof opts.value === 'object' && opts.value !== null && !Array.isArray(opts.value);
  }

  static manifestOf(opts: { cwd: string }): IGithubReleaseManifest {
    const parsed: unknown = JSON.parse(
      readFileSync(join(opts.cwd, GithubReleaseConstants.MANIFEST), 'utf8'),
    );
    const root = { value: parsed };

    if (!GithubRelease.isRecord(root)) {
      throw new Error(`${GithubReleaseConstants.MANIFEST} is not an object`);
    }

    const release = { value: root.value['release'] };
    const knowledge = { value: root.value['knowledge'] };
    const packages = root.value['packages'];
    const pattern = GithubRelease.isRecord(release) ? release.value['tagPattern'] : undefined;
    const changelogs = GithubRelease.isRecord(knowledge)
      ? knowledge.value['changelogs']
      : undefined;

    if (
      typeof pattern !== 'string' ||
      !pattern.includes('<dir>') ||
      !pattern.includes('<version>') ||
      typeof changelogs !== 'string' ||
      !Array.isArray(packages)
    ) {
      throw new Error(
        `${GithubReleaseConstants.MANIFEST} needs release.tagPattern (with <dir> and <version>), knowledge.changelogs and packages`,
      );
    }

    return {
      tagPattern: pattern,
      changelogs,
      packages: packages.flatMap((entry) => {
        const holder = { value: entry };

        return GithubRelease.isRecord(holder) &&
          typeof holder.value['name'] === 'string' &&
          typeof holder.value['dir'] === 'string'
          ? [{ name: holder.value['name'], dir: holder.value['dir'] }]
          : [];
      }),
    };
  }

  /** The tag pattern of one package: `<dir>` filled in, `<version>` left. */
  static templateOf(opts: { manifest: IGithubReleaseManifest; dir: string }): string {
    return opts.manifest.tagPattern.replaceAll('<dir>', opts.dir);
  }

  static tagOf(opts: { manifest: IGithubReleaseManifest; target: IGithubReleaseTarget }): string {
    return GithubRelease.templateOf({ manifest: opts.manifest, dir: opts.target.dir }).replace(
      '<version>',
      opts.target.version,
    );
  }

  /** The version a tag names under the template of one package, when it starts with a digit. */
  static versionOfTag(opts: { tag: string; template: string }): string | undefined {
    const escaped = opts.template
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('<version>', '(\\d\\S*)');

    return new RegExp(`^${escaped}$`).exec(opts.tag)?.[1];
  }

  /** The package and version a tag names, over every package of the manifest. */
  static targetOfTag(opts: {
    tag: string;
    manifest: IGithubReleaseManifest;
  }): IGithubReleaseTarget | undefined {
    for (const entry of opts.manifest.packages) {
      const version = GithubRelease.versionOfTag({
        tag: opts.tag,
        template: GithubRelease.templateOf({ manifest: opts.manifest, dir: entry.dir }),
      });

      if (version !== undefined) {
        return { dir: entry.dir, version };
      }
    }

    return undefined;
  }

  /**
   * The targets of a run, `dir=version,dir=version`, in release order. The plan job writes them in that order; the
   * sort keeps a list typed by hand right. A package the manifest does not know is an error: no npm name, no line.
   */
  static targetsOf(opts: {
    text: string;
    manifest: IGithubReleaseManifest;
  }): IGithubReleaseTarget[] {
    const targets = opts.text
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
      .map((entry) => {
        const [dir, version] = entry.split('=');

        if (!dir || !version || !/^\d/.test(version)) {
          throw new Error(`the target '${entry}' is not <dir>=<version>`);
        }

        if (!opts.manifest.packages.some((candidate) => candidate.dir === dir)) {
          throw new Error(`the package '${dir}' is not in ${GithubReleaseConstants.MANIFEST}`);
        }

        return { dir, version };
      });

    if (targets.length === 0) {
      throw new Error('--targets names no package');
    }

    return ReleaseOrder.sort({ names: targets.map((target) => target.dir) }).flatMap((dir) => {
      const found = targets.find((target) => target.dir === dir);

      return found === undefined ? [] : [found];
    });
  }

  /** `IGNIS 0.4.8` for the leading package; any other names itself (`IGNIS kernel 0.4.6`), so two titles never collide. */
  static titleOf(opts: { target: IGithubReleaseTarget }): string {
    return opts.target.dir === GithubReleaseConstants.LEADING_DIR
      ? `${GithubReleaseConstants.TITLE_PREFIX} ${opts.target.version}`
      : `${GithubReleaseConstants.TITLE_PREFIX} ${opts.target.dir} ${opts.target.version}`;
  }

  /** The highest tag of this package below `version`: of stables only when `stableOnly`, of every kind otherwise. */
  static previousTag(opts: {
    tags: string[];
    template: string;
    version: string;
    stableOnly: boolean;
  }): string | undefined {
    let best: { tag: string; version: string } | undefined;

    for (const tag of opts.tags) {
      const version = GithubRelease.versionOfTag({ tag, template: opts.template });

      if (
        version === undefined ||
        Bun.semver.order(version, opts.version) >= 0 ||
        (opts.stableOnly && version.includes('-')) ||
        (best !== undefined && Bun.semver.order(version, best.version) <= 0)
      ) {
        continue;
      }

      best = { tag, version };
    }

    return best?.tag;
  }

  /** Whether no stable tag of this package is above `version`: the only case in which a Release may be Latest. */
  static isNewestStable(opts: { tags: string[]; template: string; version: string }): boolean {
    return opts.tags.every((tag) => {
      const version = GithubRelease.versionOfTag({ tag, template: opts.template });

      return (
        version === undefined ||
        version.includes('-') ||
        Bun.semver.order(version, opts.version) <= 0
      );
    });
  }

  static tagsOf(opts: { cwd: string }): string[] {
    return ReleaseMergeBack.mustGit({ cwd: opts.cwd, args: ['tag', '--list'] })
      .split('\n')
      .filter((tag) => tag !== '');
  }

  /**
   * The dated changelog files added in `from..to`, oldest first; `from` absent means everything up to `to`.
   * Renames are not followed: an entry renamed inside the range counts under its new name.
   */
  static entriesAdded(opts: { cwd: string; from?: string; to: string; folder: string }): string[] {
    const range = opts.from === undefined ? opts.to : `${opts.from}..${opts.to}`;
    const names = ReleaseMergeBack.mustGit({
      cwd: opts.cwd,
      args: [
        'log',
        '--no-renames',
        '--diff-filter=A',
        '--name-only',
        '--format=',
        range,
        '--',
        opts.folder,
      ],
    })
      .split('\n')
      .filter((path) => GithubReleaseConstants.DATED_ENTRY.test(path.split('/').pop() ?? ''));

    return [...new Set(names)].sort();
  }

  /** An entry as a Release shows it: no front matter, no date heading, no badge line. */
  static stripEntry(opts: { text: string }): string {
    return opts.text
      .replace(GithubReleaseConstants.FRONT_MATTER, '')
      .replace(GithubReleaseConstants.DATE_HEADING, '')
      .replace(GithubReleaseConstants.BADGE_LINE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Text of the wiki as a Release shows it. A bare `@word` or `@org/team` outside code is put in backticks: GitHub
   * notifies the account or team it names, and a backtick keeps the name readable, which a zero-width space would
   * not (it would also break a copy of the package name). A root-relative link points at the wiki, which a Release
   * is not part of. Fenced blocks and code spans are left as they are.
   */
  static publicText(opts: { text: string }): string {
    let fenced = false;

    return opts.text
      .split('\n')
      .map((line) => {
        if (/^\s*(?:```|~~~)/.test(line)) {
          fenced = !fenced;

          return line;
        }

        return fenced
          ? line
          : line
              .split(/(`[^`]*`)/)
              .map((part, index) =>
                index % 2 === 1
                  ? part
                  : part
                      .replace(GithubReleaseConstants.MENTION, '$1`@$2`')
                      .replace(
                        GithubReleaseConstants.ROOT_LINK,
                        `](${GithubReleaseConstants.WIKI_URL}/`,
                      ),
              )
              .join('');
      })
      .join('\n');
  }

  /** The notes of a stable: the entries added since the previous stable, joined; empty when there are none. */
  static stableNotes(opts: { cwd: string; from?: string; to: string; folder: string }): string {
    return GithubRelease.entriesAdded(opts)
      .map((path) => {
        const shown = ReleaseMergeBack.git({ cwd: opts.cwd, args: ['show', `${opts.to}:${path}`] });

        return shown.status === 0
          ? GithubRelease.publicText({ text: GithubRelease.stripEntry({ text: shown.stdout }) })
          : '';
      })
      .filter((text) => text !== '')
      .join('\n\n');
  }

  /** The subjects of the commits in `from..to`, without merges and without the release commits of the loop. */
  static subjectsOf(opts: {
    cwd: string;
    from?: string;
    to: string;
    onlyIssues: boolean;
  }): string[] {
    const range = opts.from === undefined ? opts.to : `${opts.from}..${opts.to}`;
    const subjects = ReleaseMergeBack.mustGit({
      cwd: opts.cwd,
      args: ['log', '--no-merges', '--format=%s', range],
    })
      .split('\n')
      .filter(
        (subject) => subject !== '' && !GithubReleaseConstants.RELEASE_COMMIT_SUBJECT.test(subject),
      );

    return opts.onlyIssues
      ? subjects.filter((subject) => GithubReleaseConstants.ISSUE_SUBJECT.test(subject))
      : subjects;
  }

  /** A fenced list: a line in it cannot ping anyone, close an issue or break the markdown. */
  static fencedLines(opts: { lines: string[] }): string[] {
    return ['```text', ...opts.lines.map((line) => line.replaceAll('```', "'''")), '```'];
  }

  /** At most `MAX_PRERELEASE_SUBJECTS` subjects, with a closing line that says how many were left out. */
  static cappedSubjects(opts: { subjects: string[] }): string[] {
    const max = GithubReleaseConstants.MAX_PRERELEASE_SUBJECTS;

    return opts.subjects.length <= max
      ? opts.subjects
      : [...opts.subjects.slice(0, max), `... and ${opts.subjects.length - max} more`];
  }

  static packagesOf(opts: { packages: IGithubReleasePackageVersion[] }): string[] {
    return [
      '## Packages',
      '',
      ...opts.packages.map(
        (entry) =>
          `- [${entry.name}@${entry.version}](https://www.npmjs.com/package/${entry.name}/v/${entry.version})`,
      ),
    ];
  }

  static bodyOf(opts: {
    kind: TReleaseKind;
    notes: string;
    subjects: string[];
    /** The packages of the run in release order: the last is named in the install line of a prerelease. */
    packages: IGithubReleasePackageVersion[];
  }): string {
    const sections =
      opts.kind === ReleaseKinds.STABLE
        ? [opts.notes]
        : [
            `Install: \`npm install ${opts.packages.at(-1)?.name ?? ''}@next\``,
            '',
            ...(opts.subjects.length === 0
              ? []
              : [
                  'Changes since the previous tag:',
                  '',
                  ...GithubRelease.fencedLines({ lines: opts.subjects }),
                ]),
          ];

    const packages = GithubRelease.packagesOf({ packages: opts.packages }).join('\n');
    const head = sections.join('\n');
    const notice = [
      '',
      `... cut: these notes are longer than a GitHub Release can hold. The full changelog: ${GithubReleaseConstants.CHANGELOG_URL}`,
    ].join('\n');
    const room = GithubReleaseConstants.MAX_BODY_LENGTH - packages.length - notice.length - 8;

    return head.length <= room
      ? `${head}\n\n${packages}\n`
      : `${GithubRelease.cutAtLine({ text: head, max: room })}\n${notice}\n\n${packages}\n`;
  }

  /**
   * `text` cut at the last whole line within `max` characters. A fenced block left open is closed, so the cut does
   * not turn what follows into code.
   */
  static cutAtLine(opts: { text: string; max: number }): string {
    const cut = opts.text.slice(0, opts.max);
    const kept = cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0));
    const fences = kept.split('\n').filter((line) => /^\s*(?:```|~~~)/.test(line));

    return fences.length % 2 === 1 ? `${kept}\n${fences.at(-1)?.trim().slice(0, 3)}` : kept;
  }

  /**
   * Makes the Release of the run, or says why it did not: a git or filesystem failure is an outcome too. The tag is
   * the last package's. With `dryRun` it stops before `gh` creates anything and returns the notes as the message.
   */
  static create(opts: {
    cwd: string;
    targets: IGithubReleaseTarget[];
    kind: string;
    gh: TGh;
    scratchRoot: string;
    /** Falls back to commit subjects when no changelog entry covers a stable (a backfill). */
    withSubjectFallback?: boolean;
    dryRun?: boolean;
  }): IGithubReleaseOutcome {
    if (opts.kind !== ReleaseKinds.STABLE && opts.kind !== ReleaseKinds.PRERELEASE) {
      return { state: 'refused', message: `the kind '${opts.kind}' is not stable or prerelease` };
    }

    try {
      const manifest = GithubRelease.manifestOf({ cwd: opts.cwd });
      const last = opts.targets.at(-1);

      if (last === undefined) {
        return { state: 'failed', message: 'the run has no package' };
      }

      const tag = GithubRelease.tagOf({ manifest, target: last });

      if (tag === GithubReleaseConstants.ATLAS_INDEX_TAG) {
        return {
          state: 'refused',
          message: `${tag} is the release of the atlas index, not of a publish`,
        };
      }

      if ((opts.kind === ReleaseKinds.PRERELEASE) !== last.version.includes('-')) {
        return {
          state: 'refused',
          message: `${tag} is version ${last.version}, which is not a ${opts.kind}`,
        };
      }

      if (opts.gh({ args: ['release', 'view', tag, '--json', 'tagName'] }).status === 0) {
        return { state: 'exists', message: `${tag} already has a Release - skipped` };
      }

      return GithubRelease.make({ ...opts, kind: opts.kind, manifest, last, tag });
    } catch (error) {
      return { state: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  private static make(opts: {
    cwd: string;
    manifest: IGithubReleaseManifest;
    targets: IGithubReleaseTarget[];
    last: IGithubReleaseTarget;
    tag: string;
    kind: TReleaseKind;
    gh: TGh;
    scratchRoot: string;
    withSubjectFallback?: boolean;
    dryRun?: boolean;
  }): IGithubReleaseOutcome {
    const stable = opts.kind === ReleaseKinds.STABLE;
    const template = GithubRelease.templateOf({ manifest: opts.manifest, dir: opts.last.dir });
    const tags = GithubRelease.tagsOf({ cwd: opts.cwd });
    const from = GithubRelease.previousTag({
      tags,
      template,
      version: opts.last.version,
      stableOnly: stable,
    });
    const subjects = GithubRelease.subjectsOf({
      cwd: opts.cwd,
      from,
      to: opts.tag,
      onlyIssues: !(stable && opts.withSubjectFallback),
    });
    let notes = stable
      ? GithubRelease.stableNotes({
          cwd: opts.cwd,
          from,
          to: opts.tag,
          folder: opts.manifest.changelogs,
        })
      : '';

    // No entry since the previous stable is no fault: the changelog records only what affects users. A backfill of an
    // old stable that predates the changelog still lists its commits.
    if (stable && notes === '') {
      notes =
        opts.withSubjectFallback && subjects.length > 0
          ? [
              'Commits in this release:',
              '',
              ...GithubRelease.fencedLines({ lines: GithubRelease.cappedSubjects({ subjects }) }),
            ].join('\n')
          : GithubReleaseConstants.NO_USER_CHANGES;
    }

    const body = GithubRelease.bodyOf({
      kind: opts.kind,
      notes,
      subjects: GithubRelease.cappedSubjects({ subjects }),
      packages: opts.targets.map((target) => ({
        name:
          opts.manifest.packages.find((candidate) => candidate.dir === target.dir)?.name ??
          target.dir,
        version: target.version,
      })),
    });
    // Latest is one per repository, not per package: only the leading package's newest stable may take it.
    const latest =
      stable &&
      opts.last.dir === GithubReleaseConstants.LEADING_DIR &&
      GithubRelease.isNewestStable({ tags, template, version: opts.last.version });

    if (opts.dryRun) {
      return {
        state: 'planned',
        message: `${opts.tag} (${opts.kind}, ${latest ? 'Latest' : 'not Latest'}), notes since ${from ?? 'the start of history'}:\n\n${body}`,
      };
    }

    const directory = mkdtempSync(join(opts.scratchRoot, 'github-release-'));

    try {
      const file = join(directory, 'notes.md');

      writeFileSync(file, body);

      const created = opts.gh({
        args: [
          'release',
          'create',
          opts.tag,
          '--title',
          GithubRelease.titleOf({ target: opts.last }),
          '--notes-file',
          file,
          '--verify-tag',
          stable ? (latest ? '--latest' : '--latest=false') : '--prerelease',
        ],
      });

      return created.status === 0
        ? { state: 'created', message: `${opts.tag}: ${created.stdout.trim()}` }
        : { state: 'failed', message: `gh release create ${opts.tag}: ${created.stderr.trim()}` };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  /**
   * A message as the log and the run summary show it. A line that starts with `::` is a workflow command (`::add-mask::`),
   * and the text of `gh`, `git` or an input can hold a newline, so every line break becomes a space. The notes a dry
   * run prints are many lines by design; each one after the first is indented, so none starts a command.
   */
  static printable(opts: { outcome: IGithubReleaseOutcome }): string {
    return opts.outcome.state === 'planned'
      ? opts.outcome.message
          .split(/\r\n|\r|\n/)
          .map((line, index) => (index === 0 ? line : `  ${line}`))
          .join('\n')
      : opts.outcome.message.replace(/[\r\n]+/g, ' ');
  }

  static summaryOf(opts: { outcome: IGithubReleaseOutcome }): string {
    return [
      '### GitHub Release',
      '',
      `- ${opts.outcome.state}: ${GithubRelease.printable(opts)}`,
      '',
    ].join('\n');
  }

  /**
   * The targets and kind a `create` or a `backfill` asks for; `undefined` when the flags do not give them. A
   * `backfill` names one tag: its package and version are the whole run, and its kind is the version's.
   */
  static requestOf(opts: {
    args: string[];
    manifest: IGithubReleaseManifest;
  }): { targets: IGithubReleaseTarget[]; kind: string } | undefined {
    if (opts.args[0] === 'backfill') {
      const tag = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--tag' });
      const target =
        tag === undefined ? undefined : GithubRelease.targetOfTag({ tag, manifest: opts.manifest });

      return target === undefined
        ? undefined
        : {
            targets: [target],
            kind: target.version.includes('-') ? ReleaseKinds.PRERELEASE : ReleaseKinds.STABLE,
          };
    }

    const text = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--targets' });
    const kind = ReleaseMergeBack.flagValue({ args: opts.args, flag: '--kind' });

    return text === undefined || kind === undefined
      ? undefined
      : { targets: GithubRelease.targetsOf({ text, manifest: opts.manifest }), kind };
  }

  static main(opts: {
    args: string[];
    env: Record<string, string | undefined>;
    cwd?: string;
    gh?: TGh;
  }): number {
    const [command] = opts.args;
    const cwd = opts.cwd ?? process.cwd();
    const scratchRoot = opts.env['RUNNER_TEMP'] ?? tmpdir();
    const summary = opts.env['GITHUB_STEP_SUMMARY'];

    try {
      if (command === 'create' || command === 'backfill') {
        const request = GithubRelease.requestOf({
          args: opts.args,
          manifest: GithubRelease.manifestOf({ cwd }),
        });

        if (request === undefined) {
          console.error(GithubReleaseConstants.USAGE);

          return 2;
        }

        const backfill = command === 'backfill';
        const outcome = GithubRelease.create({
          cwd,
          ...request,
          gh: opts.gh ?? GithubRelease.ghOf({ cwd }),
          scratchRoot,
          withSubjectFallback: backfill,
          dryRun: backfill && !opts.args.includes('--yes'),
        });

        console.log(`github-release: ${outcome.state} - ${GithubRelease.printable({ outcome })}`);

        if (summary !== undefined) {
          appendFileSync(summary, GithubRelease.summaryOf({ outcome }));
        }

        return outcome.state === 'failed' || outcome.state === 'refused' ? 1 : 0;
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).replace(
        /[\r\n]+/g,
        ' ',
      );

      console.error(`ERROR | ${message}`);

      if (summary !== undefined) {
        appendFileSync(summary, GithubRelease.summaryOf({ outcome: { state: 'failed', message } }));
      }

      return 1;
    }

    console.error(GithubReleaseConstants.USAGE);

    return 2;
  }
}

if (import.meta.main) {
  process.exit(GithubRelease.main({ args: process.argv.slice(2), env: process.env }));
}
