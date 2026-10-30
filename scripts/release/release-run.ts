/**
 * The loop of one release run: the packages of the plan, in dependency order, one after the other.
 *
 * For each package: work out what state git and npm are in, then (bump, pack, check, publish, wait for the
 * tarball, move the dist-tags) and only then record it in git (release commit, push, tag), so that after any
 * stop git equals the registry. Everything it touches arrives through `ports`, so the order of the calls, the
 * skip and heal states and every way a run can stop are tested without a network, a registry or a remote.
 *
 *   bun scripts/release/release-run.ts plan                   # validate PLAN, print the matrix for the test jobs
 *   bun scripts/release/release-run.ts run                    # release PLAN with BUILD_MODE (the publish job)
 *   bun scripts/release/release-run.ts registry <manifest>    # every dependency of a packed manifest is served by npm (a test job)
 *
 * A re-dispatch of the same plan is safe: a package already released (its tag on origin) is skipped, one that
 * is on npm without its commit or tag gets them without a second publish, and a stale plan stops the run.
 * Nothing here rebases: a rejected push stops the run, and the next dispatch records what is missing.
 *
 * The mode decides the kind: a prerelease releases from `develop` and its release commits go to `develop`, a stable
 * (`patch`, `minor`, `major`) from `main` and to `main`. The dist-tag of a package follows its own version.
 */
import { appendFileSync } from 'node:fs';
import { ReleaseModes, ReleaseOrder, type TReleaseMode } from './release-constants';
import { ReleaseKinds, ReleaseTargets, type TReleaseKind } from './release-kind';
import { type IPlanEntry, ReleasePlanInput } from './release-plan-input';
import { ReleaseRegistry } from './release-registry';
import { ReleaseVersion } from './release-version';
import { ReleaseTarballs } from './release-tarballs';

export interface ICommandResult {
  stdout: string;
  exitCode: number;
}

export interface IReleasePorts {
  /** Runs a command. Throws on a non-zero exit unless `allowFailure` is set. */
  run: (opts: {
    command: string[];
    cwd?: string;
    allowFailure?: boolean;
  }) => Promise<ICommandResult>;
  /** `name` and `version` of `packages/<dir>/package.json`, as they are on disk now. */
  readManifest: (opts: { dir: string }) => Promise<{ name: string; version: string }>;
  sha256: (opts: { path: string }) => Promise<string>;
  registry: {
    isPublished: (opts: { packageName: string; version: string }) => Promise<boolean>;
    waitForTarball: (opts: { packageName: string; version: string }) => Promise<void>;
  };
  log: (line: string) => void;
}

export type TReleaseState = 'published' | 'healed' | 'skipped';

export interface IReleaseOutcome {
  /** The folder under `packages/`. */
  name: string;
  packageName: string;
  version: string;
  state: TReleaseState;
}

/** A version or range that names a prerelease: `0.4.9-1`, `^1.0.0-rc.2`. */
const PRERELEASE_IN_RANGE = /\d+\.\d+\.\d+-[0-9A-Za-z]/;

interface IPackedManifest {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** The marker `release.ts` reads from the log: `+` published by this run, `=` already released. */
export class ReleaseMarkers {
  static readonly PUBLISHED = '+';
  static readonly RELEASED = '=';
}

export class ReleaseRun {
  /** `highest` follows the newest version ever published, so a stable shipped late never moves it back. */
  static shouldMoveHighest(opts: { current?: string; published: string }): boolean {
    if (!opts.current) {
      return true;
    }

    return Bun.semver.order(opts.published, opts.current) > 0;
  }

  /**
   * What is wrong with a packed manifest, one line each. `siblings` holds every workspace package's version on
   * disk now (npm name -> version): bun writes exactly that into the tarball, so a different pin means the pack
   * did not see this run's bump. `pending` are the plan's packages not released yet: depending on one is an order bug.
   */
  static checkManifest(opts: {
    text: string;
    version: string;
    siblings: ReadonlyMap<string, string>;
    pending: ReadonlySet<string>;
    kind: TReleaseKind;
  }): string[] {
    const { text, version, siblings, pending, kind } = opts;
    const problems: string[] = [];

    if (/"(catalog|workspace):/.test(text)) {
      problems.push('an unresolved catalog:/workspace: protocol survives into the packed manifest');
    }

    const manifest = JSON.parse(text) as IPackedManifest;
    if (manifest.version !== version) {
      problems.push(`the tarball is ${manifest.version}, this run releases ${version}`);
    }

    for (const field of [manifest.dependencies, manifest.peerDependencies]) {
      for (const [name, range] of Object.entries(field ?? {})) {
        if (kind === ReleaseKinds.STABLE && PRERELEASE_IN_RANGE.test(range)) {
          problems.push(
            `${name} is pinned ${range}: a stable release never ships against a prerelease`,
          );
        }

        const expected = siblings.get(name);
        if (expected === undefined) {
          continue;
        }
        if (pending.has(name)) {
          problems.push(`${name} is released after this package, but this package depends on it`);
        } else if (range !== expected) {
          problems.push(`${name} is pinned ${range}, the workspace has ${expected}`);
        }
      }
    }

    return problems;
  }

  static async execute(opts: {
    entries: ReadonlyArray<IPlanEntry>;
    mode: TReleaseMode;
    /** The branch the release commits go to; it must be the branch of the mode's kind. */
    branch: 'develop' | 'main';
    issue?: string;
    tarballs: string;
    ports: IReleasePorts;
  }): Promise<IReleaseOutcome[]> {
    const { entries, mode, branch, issue, tarballs, ports } = opts;

    const expected = ReleaseKinds.branchOf({ kind: ReleaseKinds.ofMode({ mode }) });
    if (branch !== expected) {
      throw new Error(
        `a ${mode} release pushes to ${expected}, not ${branch}: nothing is published`,
      );
    }

    await ports.run({ command: ['rm', '-rf', tarballs] });
    await ports.run({ command: ['mkdir', '-p', tarballs] });

    const directories = await this.listWorkspace({ ports });
    const pending = new Set(entries.map((entry) => entry.name));
    const outcomes: IReleaseOutcome[] = [];

    for (const entry of entries) {
      pending.delete(entry.name);
      const pendingNames = new Set<string>();
      for (const dir of pending) {
        pendingNames.add((await ports.readManifest({ dir })).name);
      }

      outcomes.push(
        await this.releaseOne({
          entry,
          mode,
          branch,
          issue,
          tarballs,
          ports,
          directories,
          pendingNames,
        }),
      );
    }

    ports.log(`✓ ${outcomes.length} package(s) of the plan are released`);
    return outcomes;
  }

  /** The folders of the workspace that exist, in release order. */
  private static async listWorkspace(opts: { ports: IReleasePorts }): Promise<string[]> {
    const found: string[] = [];
    for (const dir of ReleaseOrder.NAMES) {
      try {
        await opts.ports.readManifest({ dir });
        found.push(dir);
      } catch {
        // A folder that is not there is not a sibling.
      }
    }

    return found;
  }

  private static async releaseOne(opts: {
    entry: IPlanEntry;
    mode: TReleaseMode;
    branch: 'develop' | 'main';
    issue?: string;
    tarballs: string;
    ports: IReleasePorts;
    directories: ReadonlyArray<string>;
    pendingNames: ReadonlySet<string>;
  }): Promise<IReleaseOutcome> {
    const { entry, mode, branch, issue, tarballs, ports, directories, pendingNames } = opts;
    const dir = entry.name;
    const cwd = `packages/${dir}`;
    const { log } = ports;
    const { name: packageName, version: onDisk } = await ports.readManifest({ dir });
    const outcome = (state: TReleaseState, version: string): IReleaseOutcome => ({
      name: dir,
      packageName,
      version,
      state,
    });

    if (onDisk !== entry.from) {
      return this.settle({ entry, mode, dir, packageName, onDisk, ports, outcome });
    }

    // The bump first: the target version decides whether this package is already on npm.
    await ports.run({
      command: ['npm', 'version', mode, '--no-git-tag-version', '--workspaces-update=false'],
      cwd,
    });
    const { version } = await ports.readManifest({ dir });
    const tag = `${dir}-v${version}`;

    // The plan job computed the target without running npm; what npm gave must be that, or nothing is published.
    const target = ReleaseVersion.next({ from: entry.from, mode });
    if (version !== target) {
      throw new Error(
        `npm version ${mode} gave ${dir} ${version}, the plan expected ${target}: nothing is published`,
      );
    }

    if (await ports.registry.isPublished({ packageName, version })) {
      log(`${packageName}@${version} is already on npm - recording it without publishing`);
      await this.record({ dir, packageName, version, mode, branch, issue, ports, published: true });
      log(`${ReleaseMarkers.RELEASED} ${packageName}@${version}`);
      return outcome('healed', version);
    }

    if (dir === 'core-server') {
      // The preset names the versions this release ships with, so it is written after the bump and after
      // every package of the plan before it.
      await ports.run({ command: ['bun', 'scripts/preset/vulcan-preset.ts'] });
    }

    const tarball = `${tarballs}/${dir}.tgz`;
    await ports.run({
      command: ['bun', 'pm', 'pack', '--quiet', '--filename', tarball],
      cwd,
    });
    const recorded = await ports.sha256({ path: tarball });
    const { stdout: manifestText } = await ports.run({
      command: ['tar', '-xzOf', tarball, 'package/package.json'],
    });

    const siblings = new Map<string, string>();
    for (const sibling of directories) {
      if (sibling !== dir) {
        const manifest = await ports.readManifest({ dir: sibling });
        siblings.set(manifest.name, manifest.version);
      }
    }
    const problems = this.checkManifest({
      text: manifestText,
      version,
      siblings,
      pending: pendingNames,
      kind: ReleaseKinds.ofMode({ mode }),
    });

    // Every sibling this package ships against is already on npm: one released earlier in this run (its tarball
    // answered 200 before its commit was made) or one outside the plan.
    const manifest = JSON.parse(manifestText) as IPackedManifest;
    for (const [name, pinned] of Object.entries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      if (
        siblings.has(name) &&
        !pendingNames.has(name) &&
        !(await ports.registry.isPublished({ packageName: name, version: pinned }))
      ) {
        problems.push(`${name}@${pinned} is not on npm`);
      }
    }

    if (problems.length > 0) {
      throw new Error(`${packageName}@${version} is not published: ${problems.join('; ')}`);
    }

    if ((await ports.sha256({ path: tarball })) !== recorded) {
      throw new Error(
        `the sha256 of ${tarball} changed since it was packed - what is published must be what was packed`,
      );
    }

    // Trusted publishing: no token; npm signs in with the job's identity and writes the provenance.
    // --ignore-scripts: the build already ran, so the prepublishOnly rebuild is skipped.
    const npmTag = ReleaseTargets.distTagOf({ version });
    try {
      await ports.run({
        command: [
          'npm',
          'publish',
          tarball,
          '--access',
          'public',
          '--tag',
          npmTag,
          '--ignore-scripts',
          '--provenance',
        ],
      });
    } catch (error) {
      log(
        `WARNING | a publish of ${packageName}@${version} was attempted and failed; confirm with: npm view ${packageName} versions`,
      );
      throw error;
    }
    log(`${ReleaseMarkers.PUBLISHED} ${packageName}@${version}`);
    log(`✓ Published ${packageName}@${version} (${npmTag})`);

    await this.record({
      dir,
      packageName,
      version,
      mode,
      branch,
      issue,
      ports,
      published: true,
    });

    log(`    ${tag}`);
    return outcome('published', version);
  }

  /**
   * The package is not at the version the plan started from. Either an earlier dispatch of this plan released it
   * (its version is exactly the target `from` gives with the mode, it is on npm, and its tag is on origin: nothing
   * to do; the tag is missing: write it), or the plan is stale and nothing may be published. A higher version that
   * this plan did not produce is stale too.
   */
  private static async settle(opts: {
    entry: IPlanEntry;
    mode: TReleaseMode;
    dir: string;
    packageName: string;
    onDisk: string;
    ports: IReleasePorts;
    outcome: (state: TReleaseState, version: string) => IReleaseOutcome;
  }): Promise<IReleaseOutcome> {
    const { entry, mode, dir, packageName, onDisk, ports, outcome } = opts;

    const target = ReleaseVersion.next({ from: entry.from, mode });
    if (onDisk !== target) {
      throw new Error(
        `${dir} is at ${onDisk}, not the ${entry.from} the plan started from and not the ${target} it would release (${mode}): the plan is stale, nothing is published`,
      );
    }
    if (!(await ports.registry.isPublished({ packageName, version: onDisk }))) {
      throw new Error(
        `${dir} is at ${onDisk} in git, which is not on npm, and the plan started from ${entry.from}: nothing is published`,
      );
    }

    const tag = `${dir}-v${onDisk}`;
    const { stdout } = await ports.run({
      command: ['git', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
    });
    if (stdout.trim() !== '') {
      ports.log(`${ReleaseMarkers.RELEASED} ${packageName}@${onDisk}`);
      return outcome('skipped', onDisk);
    }

    ports.log(`${packageName}@${onDisk} is released but its tag ${tag} is missing - writing it`);
    await ports.registry.waitForTarball({ packageName, version: onDisk });
    const { stdout: sha } = await ports.run({
      command: [
        'git',
        'log',
        '-1',
        '--format=%H',
        '--fixed-strings',
        '--grep',
        `chore(${dir}): release v${onDisk} `,
      ],
    });
    if (sha.trim() === '') {
      throw new Error(
        `no release commit of ${packageName}@${onDisk} in the history: its tag ${tag} cannot be written`,
      );
    }

    await ports.run({
      command: ['git', 'tag', '-a', tag, '-m', `${packageName} v${onDisk}`, sha.trim()],
    });
    await ports.run({ command: ['git', 'push', 'origin', tag] });
    ports.log(`${ReleaseMarkers.RELEASED} ${packageName}@${onDisk}`);
    return outcome('healed', onDisk);
  }

  /**
   * After the publish: wait for the tarball, move the dist-tags, then the release commit, the push and the tag.
   * A failure from here on leaves a published package whose git half is missing; it is reported, never repaired
   * (npm cannot un-publish, and chasing a live version with a force push does more damage than the gap).
   */
  private static async record(opts: {
    dir: string;
    packageName: string;
    version: string;
    mode: TReleaseMode;
    branch: 'develop' | 'main';
    issue?: string;
    ports: IReleasePorts;
    published: boolean;
  }): Promise<void> {
    const { dir, packageName, version, mode, branch, issue, ports } = opts;
    const cwd = `packages/${dir}`;
    const tag = `${dir}-v${version}`;
    const npmTag = ReleaseTargets.distTagOf({ version });
    const state = { committed: false, tagged: false };

    try {
      // The packument lists a version minutes before its tarball answers: git records it only once it is installable.
      await ports.registry.waitForTarball({ packageName, version });

      const { stdout: highest, exitCode } = await ports.run({
        command: ['npm', 'view', '--prefer-online', packageName, 'dist-tags.highest'],
        allowFailure: true,
      });
      if (
        this.shouldMoveHighest({
          current: exitCode === 0 ? highest.trim() || undefined : undefined,
          published: version,
        })
      ) {
        const moved = await ports.run({
          command: ['npm', 'dist-tag', 'add', `${packageName}@${version}`, 'highest'],
          allowFailure: true,
        });
        if (moved.exitCode !== 0) {
          ports.log(`WARNING | could not set the 'highest' dist-tag of ${packageName} (non-fatal)`);
        }
      }

      const synced = await ports.run({
        command: [
          'bun',
          'scripts/release/sync-next-tag.ts',
          '--published',
          `${packageName}@${version}`,
          '--tag',
          npmTag,
        ],
        allowFailure: true,
      });
      if (synced.exitCode !== 0) {
        ports.log(
          `WARNING | could not keep 'next' at or above 'latest' for ${packageName} (non-fatal)`,
        );
      }

      const subject = `${issue ? `[#${issue}] ` : ''}chore(${dir}): release v${version} [${mode}]`;
      await ports.run({ command: ['git', 'add', 'package.json'], cwd });
      await ports.run({ command: ['git', 'commit', '-m', subject], cwd });
      await ports.run({ command: ['git', 'push', 'origin', `HEAD:${branch}`] });
      state.committed = true;

      await ports.run({ command: ['git', 'tag', '-a', tag, '-m', `${packageName} v${version}`] });
      await ports.run({ command: ['git', 'push', 'origin', tag] });
      state.tagged = true;
    } catch (error) {
      const missing = [
        state.committed ? undefined : `its release commit (${branch} does not record the version)`,
        state.tagged ? undefined : `its tag ${tag}`,
      ].filter(Boolean);
      ports.log(
        `WARNING | ${packageName}@${version} is published, but ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing - dispatch the same plan again: the run records it without publishing`,
      );
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The command line: what the workflow runs.
// ---------------------------------------------------------------------------------------------

const spawnRun: IReleasePorts['run'] = async (opts) => {
  const proc = Bun.spawn(opts.command, {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 && !opts.allowFailure) {
    throw new Error(`[${opts.command.join(' ')}] exited ${exitCode}\n${stderr || stdout}`);
  }

  return { stdout: stdout.trim(), exitCode };
};

const realPorts = (): IReleasePorts => ({
  run: spawnRun,
  readManifest: async ({ dir }) => {
    const manifest = (await Bun.file(`packages/${dir}/package.json`).json()) as {
      name: string;
      version: string;
    };
    return { name: manifest.name, version: manifest.version };
  },
  sha256: async ({ path }) =>
    new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex'),
  registry: {
    isPublished: (opts) => ReleaseRegistry.isPublished(opts),
    waitForTarball: (opts) => ReleaseTarballs.waitFor(opts),
  },
  log: (line) => {
    console.log(line);
  },
});

const main = async (): Promise<void> => {
  const [command, manifestPath] = Bun.argv.slice(2);

  if (command === 'registry') {
    if (!manifestPath) {
      throw new Error('usage: release-run.ts registry <packed package.json>');
    }
    const manifest = (await Bun.file(manifestPath).json()) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = manifest.dependencies ?? {};
    const missing = await ReleaseRegistry.findMissing({ dependencies });
    if (missing.length > 0) {
      console.error('ERROR: the packed manifest depends on something the registry cannot serve:');
      for (const entry of missing) {
        console.error(`  - ${entry}`);
      }
      process.exit(1);
    }

    console.log(
      `    ✓ all ${Object.keys(dependencies).length} runtime dependencies resolve on the registry`,
    );
    return;
  }

  const entries = ReleasePlanInput.parse({ text: process.env.PLAN ?? '' });

  const mode = process.env.BUILD_MODE ?? '';
  if (!ReleaseModes.isValid(mode)) {
    throw new Error(
      `BUILD_MODE must be one of ${[...ReleaseModes.SCHEME_SET].join(', ')}, got: ${mode}`,
    );
  }

  if (command === 'plan') {
    const versions = new Map<string, string>();
    const { readManifest } = realPorts();
    for (const dir of ReleaseOrder.NAMES) {
      const found = await readManifest({ dir }).catch(() => undefined);
      if (found) {
        versions.set(dir, found.version);
      }
    }

    const plan = ReleaseTargets.plan({ entries, mode, ref: process.env.GITHUB_REF, versions });

    // The issue goes into the run title and into every release commit subject: only digits, or nothing.
    const issue = process.env.RELEASE_ISSUE ?? '';
    if (!/^\d*$/.test(issue)) {
      throw new Error(
        `the issue must be a number or empty, got: ${ReleaseTargets.quote({ value: issue })}`,
      );
    }

    // The run title the dispatcher chose (an optional `label`, empty for a dispatch by hand) must be the plan's own.
    const labelProblems = ReleaseTargets.labelProblems({
      label: process.env.RELEASE_LABEL,
      expected: ReleaseTargets.labelOf({
        kind: plan.kind,
        targets: plan.targets,
        issue,
        sha: process.env.GITHUB_SHA,
      }),
    });
    if (labelProblems.length > 0) {
      throw new Error(`the run title is refused:\n  - ${labelProblems.join('\n  - ')}`);
    }

    const outputs = [
      `matrix=${JSON.stringify({ package: entries.map((entry) => entry.name) })}`,
      `plan=${ReleasePlanInput.format({ entries })}`,
      `kind=${plan.kind}`,
      `branch=${plan.branch}`,
      `headline=${plan.headline}`,
      `targets=${plan.targets.map((entry) => `${entry.name}=${entry.target}`).join(',')}`,
    ];
    for (const line of outputs) {
      console.log(line);
    }
    console.log(['', ...plan.summary].join('\n'));
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### ${plan.kind} release: ${plan.headline}\n\n${plan.summary.join('\n')}\n`,
      );
    }
    return;
  }

  if (command === 'run') {
    const branch = process.env.TARGET_BRANCH;
    if (branch !== 'develop' && branch !== 'main') {
      throw new Error(`TARGET_BRANCH must be develop or main, got: ${branch ?? 'nothing'}`);
    }
    const tarballs = process.env.TARBALLS;
    if (!tarballs) {
      throw new Error('TARBALLS must name the folder the tarballs are packed into');
    }

    await ReleaseRun.execute({
      entries,
      mode,
      branch,
      issue: process.env.RELEASE_ISSUE || undefined,
      tarballs,
      ports: realPorts(),
    });
    return;
  }

  throw new Error(`usage: release-run.ts plan | run | registry (got: ${command ?? 'nothing'})`);
};

if (import.meta.main) {
  await main();
}
