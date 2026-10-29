/**
 * Starts the NPM Release workflow ONCE for the whole plan and waits for it. The run itself loops the packages
 * in dependency order (scripts/release/release-run.ts): this script plans, dispatches, watches and reads back.
 *
 *   bun scripts/release/release.ts                      # every changed package and every package that depends on one, in order
 *   bun scripts/release/release.ts kernel connectors    # these and everything after the first of them, still ordered
 *   bun scripts/release/release.ts --dry-run            # print the plan, dispatch nothing
 *   bun scripts/release/release.ts --mode patch         # default is prerelease
 *   bun scripts/release/release.ts --yes                # skip the confirmation prompt
 *   bun scripts/release/release.ts --issue 80           # prefix every release commit with [#80]
 *   bun scripts/release/release.ts --plan <plan> --yes  # send a plan as printed, to continue a run that stopped
 *
 * A run that stopped is continued by sending the same plan again: the packages it already released are skipped,
 * one that is on npm without its commit or tag gets them, the rest are released. The plan is printed on every
 * run as a ready `--plan` value, because planning again from git would drop a package that only cascaded from a
 * sibling the first run released.
 */

import { parseReleaseArgs } from './release-args';
import { ReleaseDispatch } from './release-dispatch';
import { ReleaseModes, ReleaseOrder } from './release-constants';
import { planFullSweep } from './release-plan';
import { type IPlanEntry, ReleasePlanInput } from './release-plan-input';
import { type IPublishedPackage, waitForTarballs } from './release-tarballs';
import { type IRunStatus, watchRun } from './release-watch';

const BRANCH = ReleaseDispatch.REF;

interface IPackageState {
  name: string;
  packageName: string;
  localVersion: string;
  publishedVersion: string | null;
  changedFiles: number;
  /** The workspace packages this one ships as dependencies or peer dependencies (npm names). */
  dependsOn: string[];
}

const run = async (opts: {
  command: string[];
  allowFailure?: boolean;
}): Promise<{ stdout: string; exitCode: number }> => {
  const proc = Bun.spawn(opts.command, { stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0 && !opts.allowFailure) {
    throw new Error(`[${opts.command.join(' ')}] exited ${exitCode}\n${stderr || stdout}`);
  }

  return { stdout: stdout.trim(), exitCode };
};

const readJson = async (path: string): Promise<Record<string, any>> => {
  return JSON.parse(await Bun.file(path).text());
};

/**
 * The version `distTag` points at, or null when the package has never been released under it.
 *
 * `--prefer-online` is not decoration: `npm view` serves a cached metadata document by default, so
 * a poll that repeats every five seconds can re-read the same stale answer for its whole window and
 * report a live publish as missing.
 */
const resolvePublishedVersion = async (opts: {
  packageName: string;
  distTag: string;
}): Promise<string | null> => {
  const { stdout, exitCode } = await run({
    command: ['npm', 'view', '--prefer-online', `${opts.packageName}@${opts.distTag}`, 'version'],
    allowFailure: true,
  });

  return exitCode === 0 && stdout ? stdout : null;
};

/**
 * Source files changed since this package's own last release commit - which is what decides whether
 * it needs releasing, not whether the working tree is dirty.
 */
const countChangedSinceRelease = async (opts: { name: string }): Promise<number> => {
  const { stdout } = await run({
    command: ['git', 'log', '--format=%H %s', '--', `packages/${opts.name}/package.json`],
  });

  const releaseCommit = stdout
    .split('\n')
    .find((line) => line.includes('release v'))
    ?.split(' ')[0];

  if (!releaseCommit) {
    return Number.POSITIVE_INFINITY;
  }

  const { stdout: committed } = await run({
    command: [
      'git',
      'diff',
      '--name-only',
      `${releaseCommit}..HEAD`,
      '--',
      `packages/${opts.name}/src`,
    ],
  });

  // UNCOMMITTED work counts too. Without this the plan reads "nothing to release" while the tree
  // holds a whole feature - technically true of the remote, and exactly the wrong thing to tell
  // someone asking whether they are ready. The clean-tree gate still refuses to dispatch.
  const { stdout: pending } = await run({
    command: ['git', 'status', '--porcelain', '--', `packages/${opts.name}/src`],
  });

  const files = new Set<string>();
  const committedLines = committed.split('\n');
  for (const line of committedLines) {
    if (line) {
      files.add(line);
    }
  }
  const pendingLines = pending.split('\n');
  for (const line of pendingLines) {
    const path = line.slice(3).trim();
    if (path) {
      files.add(path);
    }
  }

  return files.size;
};

const collectState = async (opts: {
  names: readonly string[];
  distTag: string;
}): Promise<IPackageState[]> => {
  const states: IPackageState[] = [];

  for (const name of opts.names) {
    const manifestPath = `packages/${name}/package.json`;
    if (!(await Bun.file(manifestPath).exists())) {
      continue;
    }

    const manifest = await readJson(manifestPath);

    states.push({
      name,
      packageName: manifest.name,
      localVersion: manifest.version,
      publishedVersion: await resolvePublishedVersion({
        packageName: manifest.name,
        distTag: opts.distTag,
      }),
      changedFiles: await countChangedSinceRelease({ name }),
      // Only what is published counts: `dependencies` and `peerDependencies`, never `devDependencies`.
      dependsOn: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
    });
  }

  return states;
};

/**
 * Refuses to start from a tree that would publish something other than what the operator is looking
 * at. The workflow checks out the BRANCH, not the local HEAD, so anything uncommitted or unpushed is
 * simply not in the release.
 */
const assertReleasable = async (opts: { isDryRun: boolean }): Promise<void> => {
  // Reported rather than thrown on a dry run: it publishes nothing, and it is most useful WHILE the
  // tree is still dirty - refusing to plan a release until the work is committed is backwards.
  const complain = (message: string): void => {
    if (opts.isDryRun) {
      console.log(`  ! ${message}`);
      return;
    }
    throw new Error(message);
  };

  // Always fetched: every version this script reports is read from the local checkout, and a stale
  // checkout is what makes the repo and the registry look like they disagree when they do not.
  await run({ command: ['git', 'fetch', 'origin', '--quiet'] });

  const { stdout: branch } = await run({ command: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'] });
  if (branch !== BRANCH) {
    complain(`On '${branch}', not '${BRANCH}'. The workflow releases from '${BRANCH}'.`);
  }

  const { stdout: dirty } = await run({ command: ['git', 'status', '--porcelain'] });
  if (dirty) {
    complain(
      `Working tree is not clean - ${dirty.split('\n').length} path(s). The workflow builds from the remote, so uncommitted work would NOT be released.`,
    );
  }

  const { stdout: counts } = await run({
    command: ['git', 'rev-list', '--left-right', '--count', `HEAD...origin/${BRANCH}`],
  });
  const [ahead, behind] = counts.split(/\s+/).map(Number);

  if (ahead > 0) {
    complain(`${ahead} commit(s) not pushed. The workflow builds origin/${BRANCH}; push first.`);
  }
  if (behind > 0) {
    complain(
      `${behind} commit(s) behind origin/${BRANCH}. Pull first, or you will read stale versions.`,
    );
  }
};

/** The most recent run id for this workflow, so a new dispatch can be told apart from it. */
const resolveLatestRunId = async (): Promise<string> => {
  const { stdout } = await run({
    command: [
      'gh',
      'run',
      'list',
      `--workflow=${ReleaseDispatch.WORKFLOW}`,
      '--limit',
      '1',
      '--json',
      'databaseId',
    ],
  });

  const runs = JSON.parse(stdout) as Array<{ databaseId: number }>;
  return runs[0] ? String(runs[0].databaseId) : '';
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until a run newer than `previousRunId` appears, so we watch OUR dispatch and not an older one. */
const waitForNewRun = async (opts: { previousRunId: string }): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(4_000);

    const latest = await resolveLatestRunId();
    if (latest && latest !== opts.previousRunId) {
      return latest;
    }
  }

  throw new Error('Dispatched, but no new workflow run appeared within two minutes.');
};

/** Watches the run to its end. A run that waits for an approval is waited for, with no deadline, and said so once. */
const waitForCompletion = (opts: { runId: string }): Promise<string> =>
  watchRun({
    view: async () => {
      const { stdout } = await run({
        command: ['gh', 'run', 'view', opts.runId, '--json', 'status,conclusion'],
      });
      return JSON.parse(stdout) as IRunStatus;
    },
    sleep,
    onWaiting: () => {
      console.log(
        `  run ${opts.runId} is waiting for an approval in the Actions page - still watching, no time limit`,
      );
    },
  });

/**
 * A green workflow is not proof of a release: the proof is the run's own log, one line per package of the plan,
 * `+ <name>@<version>` (published by this run) or `= <name>@<version>` (already released: skipped, or recorded
 * without a second publish). It is not the registry, whose metadata shows a new version 3 to 16 minutes late
 * (measured 2026-10-15). A package with neither line is an error, whatever the run's colour.
 */
const readReleased = async (opts: {
  runId: string;
  states: ReadonlyArray<IPackageState>;
}): Promise<IPublishedPackage[]> => {
  const { stdout } = await run({ command: ['gh', 'run', 'view', opts.runId, '--log'] });
  const outcomes = ReleaseDispatch.readOutcomes({
    log: stdout,
    packageNames: opts.states.map((state) => state.packageName),
  });

  const missing = opts.states.filter((state) => !outcomes.has(state.packageName));
  if (missing.length > 0) {
    throw new Error(
      `Run ${opts.runId} is green but its log has no "+" or "=" line for: ${missing.map((state) => state.packageName).join(', ')}. Check the release step before anything else: gh run view ${opts.runId} --log`,
    );
  }

  return opts.states.map((state) => {
    const outcome = outcomes.get(state.packageName)!;
    console.log(
      `  ${outcome.marker === '+' ? 'published' : 'already released'} ${state.packageName}@${outcome.version}`,
    );
    return { packageName: state.packageName, version: outcome.version };
  });
};

const main = async (): Promise<void> => {
  const {
    isDryRun,
    isConfirmed,
    mode,
    plan: planText,
    issue,
    named,
  } = parseReleaseArgs(Bun.argv.slice(2));
  const unknownNames = named.filter((name) => !ReleaseOrder.isKnown(name));
  if (unknownNames.length > 0) {
    throw new Error(
      `Unknown package(s): ${unknownNames.join(', ')}. Known: ${ReleaseOrder.NAMES.join(', ')}`,
    );
  }
  if (planText !== undefined && named.length > 0) {
    throw new Error('--plan carries its own packages: do not name packages next to it');
  }

  await assertReleasable({ isDryRun });

  // A name means "from here on": the package and everything after it in the chain, so a consumer
  // never gets a new package beside a stale one that depends on it.
  const start =
    named.length > 0
      ? Math.min(...named.map((name) => ReleaseOrder.NAMES.indexOf(name as never)))
      : -1;
  const requested: Array<string> = start >= 0 ? ReleaseOrder.NAMES.slice(start) : [];
  const candidates: ReadonlyArray<string> = requested.length > 0 ? requested : ReleaseOrder.NAMES;

  const states = await collectState({
    names: candidates,
    distTag: ReleaseModes.toDistTag({ mode }),
  });
  const cascadedFrom = new Map<string, string[]>();
  let entries: IPlanEntry[];
  let plan: IPackageState[];

  if (planText !== undefined) {
    // The plan of an earlier dispatch, as printed: sent unchanged.
    entries = ReleasePlanInput.parse({ text: planText });
    const everyState = await collectState({
      names: ReleaseOrder.NAMES,
      distTag: ReleaseModes.toDistTag({ mode }),
    });
    plan = entries.map((entry) => everyState.find((state) => state.name === entry.name)!);
  } else {
    // An explicit request is honoured as given. A full sweep releases what changed AND every package
    // that depends on it: the published manifests pin internal dependencies exactly, so a package left
    // behind keeps pointing at the old version and consumers install both copies.
    plan = states;
    if (requested.length === 0) {
      const planned = planFullSweep({ packages: states });
      for (const entry of planned) {
        if (entry.cascadedFrom) {
          cascadedFrom.set(entry.name, entry.cascadedFrom);
        }
      }
      plan = states.filter((state) => planned.some((entry) => entry.name === state.name));
    }
    entries = plan.map((state) => ({ name: state.name, from: state.localVersion }));
  }

  if (plan.length === 0) {
    console.log('Nothing to release - no package has source changes since its last release.');
    return;
  }

  console.log(`Release plan (${mode}), in dependency order:\n`);
  for (const state of plan) {
    const changed =
      state.changedFiles === Number.POSITIVE_INFINITY
        ? 'never released'
        : `${state.changedFiles} file(s)`;
    const cascade = cascadedFrom.get(state.name);
    const why = cascade
      ? `  (no source change: depends on ${cascade.join(', ')}, pinned exactly)`
      : '';
    console.log(
      `  ${state.name.padEnd(13)} ${state.localVersion.padEnd(10)} npm:${(state.publishedVersion ?? '-').padEnd(10)} ${changed}${why}`,
    );
  }
  console.log(
    `\nOne run for all of it. To continue it after a stop: bun scripts/release/release.ts ${ReleaseDispatch.planFlag({ entries })} --mode ${mode}${issue ? ` --issue ${issue}` : ''} --yes`,
  );

  if (isDryRun) {
    console.log('\n--dry-run: nothing dispatched.');
    return;
  }

  if (!isConfirmed) {
    console.log(`\nThis publishes ${plan.length} package(s) to npm. Re-run with --yes to proceed.`);
    return;
  }

  const previousRunId = await resolveLatestRunId();
  await run({ command: ['gh', ...ReleaseDispatch.buildArgs({ entries, mode, issue })] });

  const runId = await waitForNewRun({ previousRunId });
  console.log(`\n  run ${runId} - waiting...`);

  const conclusion = await waitForCompletion({ runId });
  if (conclusion !== 'success') {
    throw new Error(
      `Run ${runId} finished '${conclusion}'. See: gh run view ${runId} --log-failed. Continue it by sending the same plan: ${ReleaseDispatch.planFlag({ entries })}`,
    );
  }

  const released = await readReleased({ runId, states: plan });

  // The workflow pushes its own release commits. Without this the operator reads a repo that disagrees
  // with the registry.
  await run({ command: ['git', 'pull', '--ff-only', '--quiet', 'origin', BRANCH] });

  // The workflow is green and the packument lists the versions, but a tarball can answer 404 for
  // minutes after that, and an install of the train fails in that window. Done means installable.
  console.log(`\n  waiting until all ${released.length} tarball(s) answer 200...`);
  await waitForTarballs({ packages: released });

  console.log(`\n✓ Released ${plan.length} package(s); every tarball answers 200.`);
};

await main();

export {};
