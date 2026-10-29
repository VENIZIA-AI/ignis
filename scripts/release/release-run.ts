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
 *
 * A re-dispatch of the same plan is safe: a package already released (its tag on origin) is skipped, one that
 * is on npm without its commit or tag gets them without a second publish, and a stale plan stops the run.
 * Nothing here rebases: a rejected push stops the run, and the next dispatch records what is missing.
 */
import { appendFileSync } from 'node:fs';
import {
  ReleaseModes,
  ReleaseOrder,
  type TNpmDistTag,
  type TReleaseMode,
} from './release-constants';
import { type IPlanEntry, ReleasePlanInput } from './release-plan-input';
import { ReleaseRegistry } from './release-registry';
import { waitForTarball } from './release-tarballs';

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
  }): string[] {
    const { text, version, siblings, pending } = opts;
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
    issue?: string;
    tarballs: string;
    ports: IReleasePorts;
  }): Promise<IReleaseOutcome[]> {
    const { entries, mode, issue, tarballs, ports } = opts;

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
        await this.releaseOne({ entry, mode, issue, tarballs, ports, directories, pendingNames }),
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
    issue?: string;
    tarballs: string;
    ports: IReleasePorts;
    directories: ReadonlyArray<string>;
    pendingNames: ReadonlySet<string>;
  }): Promise<IReleaseOutcome> {
    const { entry, mode, issue, tarballs, ports, directories, pendingNames } = opts;
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
      return this.settle({ entry, dir, packageName, onDisk, ports, outcome });
    }

    // The bump first: the target version decides whether this package is already on npm.
    await ports.run({
      command: ['npm', 'version', mode, '--no-git-tag-version', '--workspaces-update=false'],
      cwd,
    });
    const { version } = await ports.readManifest({ dir });
    const tag = `${dir}-v${version}`;

    if (await ports.registry.isPublished({ packageName, version })) {
      log(`${packageName}@${version} is already on npm - recording it without publishing`);
      await this.record({ dir, packageName, version, mode, issue, ports, published: true });
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
    const npmTag = ReleaseModes.toDistTag({ mode });
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
      issue,
      ports,
      published: true,
      npmTag: npmTag as TNpmDistTag,
    });

    log(`    ${tag}`);
    return outcome('published', version);
  }

  /**
   * The package is not at the version the plan started from. Either an earlier dispatch of this plan released it
   * (its version is above `from`, it is on npm, and its tag is on origin: nothing to do; the tag is missing: write
   * it), or the plan is stale and nothing may be published.
   */
  private static async settle(opts: {
    entry: IPlanEntry;
    dir: string;
    packageName: string;
    onDisk: string;
    ports: IReleasePorts;
    outcome: (state: TReleaseState, version: string) => IReleaseOutcome;
  }): Promise<IReleaseOutcome> {
    const { entry, dir, packageName, onDisk, ports, outcome } = opts;

    if (Bun.semver.order(onDisk, entry.from) < 0) {
      throw new Error(
        `${dir} is at ${onDisk}, below the ${entry.from} the plan started from: the plan is stale, nothing is published`,
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
    issue?: string;
    ports: IReleasePorts;
    published: boolean;
    npmTag?: TNpmDistTag;
  }): Promise<void> {
    const { dir, packageName, version, mode, issue, ports } = opts;
    const cwd = `packages/${dir}`;
    const tag = `${dir}-v${version}`;
    const npmTag = opts.npmTag ?? ReleaseModes.toDistTag({ mode });
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
      await ports.run({ command: ['git', 'push', 'origin', 'HEAD:develop'] });
      state.committed = true;

      await ports.run({ command: ['git', 'tag', '-a', tag, '-m', `${packageName} v${version}`] });
      await ports.run({ command: ['git', 'push', 'origin', tag] });
      state.tagged = true;
    } catch (error) {
      const missing = [
        state.committed ? undefined : 'its release commit (develop does not record the version)',
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
    waitForTarball: (opts) => waitForTarball(opts),
  },
  log: (line) => {
    console.log(line);
  },
});

const main = async (): Promise<void> => {
  const [command] = Bun.argv.slice(2);
  const entries = ReleasePlanInput.parse({ text: process.env.PLAN ?? '' });

  if (command === 'plan') {
    const matrix = JSON.stringify({ package: entries.map((entry) => entry.name) });
    const line = `matrix=${matrix}`;
    console.log(line);
    console.log(`plan=${ReleasePlanInput.format({ entries })}`);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${line}\nplan=${ReleasePlanInput.format({ entries })}\n`,
      );
    }
    return;
  }

  if (command === 'run') {
    const mode = process.env.BUILD_MODE ?? '';
    if (!ReleaseModes.isValid(mode)) {
      throw new Error(
        `BUILD_MODE must be one of ${[...ReleaseModes.SCHEME_SET].join(', ')}, got: ${mode}`,
      );
    }
    const tarballs = process.env.TARBALLS;
    if (!tarballs) {
      throw new Error('TARBALLS must name the folder the tarballs are packed into');
    }

    await ReleaseRun.execute({
      entries,
      mode,
      issue: process.env.RELEASE_ISSUE || undefined,
      tarballs,
      ports: realPorts(),
    });
    return;
  }

  throw new Error(`usage: release-run.ts plan | run (got: ${command ?? 'nothing'})`);
};

if (import.meta.main) {
  await main();
}
