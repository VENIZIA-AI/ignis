import { ReleaseModes, ReleaseOrder, type TReleaseMode } from './release-constants';
import { type IPlanEntry } from './release-plan-input';
import { ReleaseVersion } from './release-version';

/** How much of a refused value is echoed to the log. */
const LABEL_ECHO_LIMIT = 200;

export type TReleaseKind = 'prerelease' | 'stable';

/** The two kinds of run. The mode decides the kind: `npm version patch|minor|major` always gives a stable version. */
export class ReleaseKinds {
  static readonly PRERELEASE = 'prerelease' as const;
  static readonly STABLE = 'stable' as const;

  static ofMode(opts: { mode: TReleaseMode }): TReleaseKind {
    return ReleaseModes.STABLE_SET.has(opts.mode) ? this.STABLE : this.PRERELEASE;
  }

  /** The branch a kind releases from, and the one its release commits go to: `develop` for a prerelease, `main` for a stable. */
  static branchOf(opts: { kind: TReleaseKind }): 'develop' | 'main' {
    return opts.kind === this.STABLE ? 'main' : 'develop';
  }

  /** What is wrong with the ref the workflow was dispatched on, or `undefined` when it is the branch of the kind. */
  static checkRef(opts: { kind: TReleaseKind; ref: string | undefined }): string | undefined {
    const branch = this.branchOf({ kind: opts.kind });
    if (opts.ref === `refs/heads/${branch}`) {
      return undefined;
    }

    return `a ${opts.kind} release runs from ${branch}, this run was dispatched on ${opts.ref || 'no ref'}`;
  }
}

export interface IReleaseTarget {
  name: string;
  from: string;
  /** The version the run gives the package. */
  target: string;
  distTag: 'latest' | 'next';
}

export interface IReleasePlanSummary {
  kind: TReleaseKind;
  branch: 'develop' | 'main';
  targets: IReleaseTarget[];
  /** `<n> packages, up to <highest target>`: what the approver reads in the name of the approval. */
  headline: string;
  /** Markdown lines for the step summary: the table of package, from, target and dist-tag. */
  summary: string[];
}

/** The decisions of the plan job: what a run would publish, and whether the plan is the one the mode allows. */
export class ReleaseTargets {
  static isPrerelease(opts: { version: string }): boolean {
    return opts.version.includes('-');
  }

  /** A version with a prerelease part is published under `next`, any other under `latest`, whatever the mode. */
  static distTagOf(opts: { version: string }): 'latest' | 'next' {
    return this.isPrerelease(opts) ? 'next' : 'latest';
  }

  static of(opts: { entries: ReadonlyArray<IPlanEntry>; mode: TReleaseMode }): IReleaseTarget[] {
    return opts.entries.map((entry) => {
      const target = ReleaseVersion.next({ from: entry.from, mode: opts.mode });
      return {
        name: entry.name,
        from: entry.from,
        target,
        distTag: this.distTagOf({ version: target }),
      };
    });
  }

  /**
   * The packages a stable release moves, from the versions on the dispatched commit (`dir` -> version).
   * A patch moves every package that has a prerelease part; a minor or a major moves all of them.
   */
  static scopeOf(opts: {
    mode: TReleaseMode;
    versions: ReadonlyMap<string, string>;
  }): IPlanEntry[] {
    const names = ReleaseOrder.sort({ names: [...opts.versions.keys()] });
    const moved =
      opts.mode === ReleaseModes.PATCH
        ? names.filter((name) => this.isPrerelease({ version: opts.versions.get(name)! }))
        : names;

    return moved.map((name) => ({ name, from: opts.versions.get(name)! }));
  }

  /**
   * What is wrong with a stable plan, one line each; a prerelease plan has no scope rule. The scope is worked out
   * here from the versions on the commit, never trusted from the input. A package already at the version the plan
   * would give it was released by an earlier dispatch of this plan, and does not count against the scope.
   */
  static checkScope(opts: {
    mode: TReleaseMode;
    entries: ReadonlyArray<IPlanEntry>;
    versions: ReadonlyMap<string, string>;
  }): string[] {
    const { mode, entries, versions } = opts;
    if (ReleaseKinds.ofMode({ mode }) === ReleaseKinds.PRERELEASE) {
      return [];
    }

    const problems: string[] = [];
    const inPlan = new Set(entries.map((entry) => entry.name));

    for (const entry of entries) {
      const onDisk = versions.get(entry.name);
      const target = ReleaseVersion.next({ from: entry.from, mode });
      if (onDisk === undefined) {
        problems.push(`${entry.name} is not a package of this checkout`);
      } else if (onDisk === target) {
        continue;
      } else if (onDisk !== entry.from) {
        problems.push(
          `${entry.name} is at ${onDisk}, not the ${entry.from} of the plan: the plan is stale`,
        );
      } else if (mode === ReleaseModes.PATCH && !this.isPrerelease({ version: entry.from })) {
        problems.push(
          `${entry.name} is at ${entry.from}, which has no prerelease part: a patch has nothing to promote, a stable already exists`,
        );
      }
    }

    for (const [name, version] of versions) {
      const needed = mode === ReleaseModes.PATCH ? this.isPrerelease({ version }) : true;
      if (needed && !inPlan.has(name)) {
        problems.push(
          `${name} (${version}) is missing from the plan: a ${mode} moves ${mode === ReleaseModes.PATCH ? 'every package that has a prerelease part' : 'all packages'}`,
        );
      }
    }

    if (mode !== ReleaseModes.PATCH) {
      const lines = new Set(entries.map((entry) => entry.from.split('.').slice(0, 2).join('.')));
      if (lines.size > 1) {
        problems.push(
          `the packages are on different lines (${[...lines].sort().join(', ')}): a ${mode} would move some of them twice. Send the plan of the run that stopped, unchanged`,
        );
      }
    }

    return problems;
  }

  static headlineOf(opts: { targets: ReadonlyArray<IReleaseTarget> }): string {
    const highest = opts.targets.reduce(
      (best, entry) => (Bun.semver.order(entry.target, best) > 0 ? entry.target : best),
      opts.targets[0].target,
    );

    return `${opts.targets.length} packages, up to ${highest}`;
  }

  static tableOf(opts: { targets: ReadonlyArray<IReleaseTarget> }): string[] {
    return [
      '| package | now | target | dist-tag |',
      '| --- | --- | --- | --- |',
      ...opts.targets.map(
        (entry) => `| ${entry.name} | ${entry.from} | ${entry.target} | ${entry.distTag} |`,
      ),
    ];
  }

  /**
   * The run title the dispatcher sends and the plan job checks: `stable · 0.4.6 boot,kernel; 0.4.5 filter · #664 · c84852a`
   * (the kind, each target version from the highest down with its packages in release order, the issue, the
   * seven-character commit). A workflow cannot work these out when it names the run, so `release.ts` says them and
   * `plan` refuses a title that is not what it computes: the title cannot name a version, a package or a commit the
   * run does not release.
   */
  static labelOf(opts: {
    kind: TReleaseKind;
    targets: ReadonlyArray<IReleaseTarget>;
    issue?: string;
    sha?: string;
  }): string {
    const byVersion = new Map<string, string[]>();
    for (const entry of opts.targets) {
      byVersion.set(entry.target, [...(byVersion.get(entry.target) ?? []), entry.name]);
    }

    const versions = [...byVersion.entries()]
      .sort(([left], [right]) => Bun.semver.order(right, left))
      .map(([version, names]) => `${version} ${names.join(',')}`)
      .join('; ');
    const issue = opts.issue === undefined || opts.issue === '' ? [] : [`#${opts.issue}`];
    const sha = opts.sha === undefined || opts.sha === '' ? [] : [opts.sha.slice(0, 7)];

    return [opts.kind, versions, ...issue, ...sha].join(' · ');
  }

  /**
   * A value as one log-safe quoted string: JSON quoting (a newline, a quote) plus an escape for the characters that
   * JSON leaves as they are and that change how a log line reads: the bidirectional controls and the zero-width ones.
   */
  static quote(opts: { value: string }): string {
    const shown =
      opts.value.length > LABEL_ECHO_LIMIT
        ? `${opts.value.slice(0, LABEL_ECHO_LIMIT)} (${opts.value.length - LABEL_ECHO_LIMIT} more characters)`
        : opts.value;

    // Everything but printable ASCII and the middle dot of the label is written as an escape.
    return JSON.stringify(shown).replaceAll(/[^ -~·]/gu, (char) => {
      const code = char.codePointAt(0) ?? 0;
      const hex = code.toString(16).padStart(4, '0');

      return code > 0xffff ? `\\u{${hex}}` : `\\u${hex}`;
    });
  }

  /** Why a label is not the one this plan gives; empty when it is, or when there is none (a dispatch by hand). */
  static labelProblems(opts: { label: string | undefined; expected: string }): string[] {
    return opts.label === undefined || opts.label === '' || opts.label === opts.expected
      ? []
      : [
          `the label ${this.quote({ value: opts.label })} is not what the plan computes: ${this.quote({ value: opts.expected })}`,
        ];
  }

  /** The plan job: refuses a wrong ref or scope with every reason, otherwise says what the run would publish. */
  static plan(opts: {
    entries: ReadonlyArray<IPlanEntry>;
    mode: TReleaseMode;
    ref: string | undefined;
    versions: ReadonlyMap<string, string>;
  }): IReleasePlanSummary {
    const { entries, mode, ref, versions } = opts;
    const kind = ReleaseKinds.ofMode({ mode });
    const problems = [
      ReleaseKinds.checkRef({ kind, ref }),
      ...this.checkScope({ mode, entries, versions }),
    ].filter((problem): problem is string => problem !== undefined);
    if (problems.length > 0) {
      throw new Error(`the plan is refused:\n  - ${problems.join('\n  - ')}`);
    }

    const targets = this.of({ entries, mode });
    return {
      kind,
      branch: ReleaseKinds.branchOf({ kind }),
      targets,
      headline: this.headlineOf({ targets }),
      summary: this.tableOf({ targets }),
    };
  }
}
