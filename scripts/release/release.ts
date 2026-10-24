/**
 * Drives the NPM Release workflow one package at a time, in dependency order, waiting for each run
 * to finish before dispatching the next.
 *
 * The waiting is the whole point. `package-release.yml` runs `force-update` over the WHOLE workspace
 * (`--filter "@venizia/*"`), so a range that goes stale mid-flight fails the run: a core-worker
 * release once died on a range belonging to core-server, six minutes after a connectors release made
 * it stale. Dispatching by hand invites exactly that.
 *
 *   bun scripts/release/release.ts                      # every package that needs one, in order
 *   bun scripts/release/release.ts kernel connectors    # just these, still ordered and still sequential
 *   bun scripts/release/release.ts --dry-run            # print the plan, dispatch nothing
 *   bun scripts/release/release.ts --mode patch         # default is prerelease
 *   bun scripts/release/release.ts --yes                # skip the confirmation prompt
 *   bun scripts/release/release.ts --issue 80           # prefix every release commit with [#80]
 */

import { parseReleaseArgs, type TReleaseMode } from './release-args';

const WORKFLOW = 'package-release.yml';
const BRANCH = 'develop';

/**
 * Dependency order, not alphabetical. A package must publish after everything it depends on, or the
 * release's own registry-existence gate fails on a version that is not out yet.
 *
 * `core-worker` depends on kernel only, so it does not wait for connectors or core-server - but it
 * still runs sequentially, because the workspace-wide `force-update` is what cannot overlap.
 */
const RELEASE_ORDER = [
  'dev-configs',
  'inversion',
  'filter',
  'helpers',
  'boot',
  'kernel',
  'connectors',
  'core-worker',
  'core-server',
] as const;

/** The workflow publishes a stable bump under `latest` and a pre* bump under `next`. */
const STABLE_MODES: ReadonlySet<TReleaseMode> = new Set(['patch', 'minor', 'major']);

const toDistTag = (opts: { mode: TReleaseMode }): string =>
  STABLE_MODES.has(opts.mode) ? 'latest' : 'next';

interface IPackageState {
  name: string;
  packageName: string;
  localVersion: string;
  publishedVersion: string | null;
  changedFiles: number;
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

const readJson = async (path: string): Promise<Record<string, string>> => {
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
    .find(line => line.includes('release v'))
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
      `--workflow=${WORKFLOW}`,
      '--limit',
      '1',
      '--json',
      'databaseId',
    ],
  });

  const runs = JSON.parse(stdout) as Array<{ databaseId: number }>;
  return runs[0] ? String(runs[0].databaseId) : '';
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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

const waitForCompletion = async (opts: { runId: string }): Promise<string> => {
  for (;;) {
    const { stdout } = await run({
      command: ['gh', 'run', 'view', opts.runId, '--json', 'status,conclusion'],
    });

    const { status, conclusion } = JSON.parse(stdout) as { status: string; conclusion: string };
    if (status === 'completed') {
      return conclusion;
    }

    await sleep(10_000);
  }
};

/**
 * A green workflow is not proof of a publish: a run can put a version on npm and still fail
 * afterwards, and a green run whose publish silently did nothing is exactly what this catches. The
 * proof is the run's own publish line, `+ <name>@<version>` from `bun publish` - not the registry,
 * whose metadata shows a new version 3 to 16 minutes late (measured 2026-10-15), which made every
 * chain wait that long per package.
 */
const assertPublished = async (opts: { state: IPackageState; runId: string }): Promise<string> => {
  const { stdout } = await run({ command: ['gh', 'run', 'view', opts.runId, '--log'] });
  const marker = `+ ${opts.state.packageName}@`;
  const line = stdout.split('\n').find(entry => entry.includes(marker) && !entry.includes('echo'));
  const version = line?.slice(line.indexOf(marker) + marker.length).trim();

  if (!version) {
    throw new Error(
      `Run ${opts.runId} is green but its log has no "${marker}" line. Check the Publish step before anything else: gh run view ${opts.runId} --log`,
    );
  }
  return version;
};

const releasePackage = async (opts: {
  state: IPackageState;
  mode: TReleaseMode;
  issue?: string;
  /** npm names published earlier in this run: their CI trusts the workspace for them. */
  chainReleased: Array<string>;
}): Promise<void> => {
  const { state, mode, issue, chainReleased } = opts;

  console.log(`\n▶ ${state.name} (${state.localVersion} -> ${mode})`);

  const previousRunId = await resolveLatestRunId();

  await run({
    command: [
      'gh',
      'workflow',
      'run',
      WORKFLOW,
      '-f',
      `package=${state.name}`,
      '-f',
      `build_mode=${mode}`,
      ...(issue ? ['-f', `issue=${issue}`] : []),
      // Internal ranges from the workspace: the previous package of this chain is published and
      // pushed, but npm may not show it for minutes.
      '-f',
      'dependencies_from=workspace',
      '-f',
      `chain_released=${chainReleased.join(',')}`,
    ],
  });

  const runId = await waitForNewRun({ previousRunId });
  console.log(`  run ${runId} - waiting...`);

  const conclusion = await waitForCompletion({ runId });
  if (conclusion !== 'success') {
    throw new Error(
      `Run ${runId} finished '${conclusion}'. See: gh run view ${runId} --log-failed`,
    );
  }

  const published = await assertPublished({ state, runId });
  console.log(`  published ${state.packageName}@${published}`);

  // The workflow pushes its own release commit. Without this the next package reads a stale local
  // version and the operator reads a repo that disagrees with the registry.
  await run({ command: ['git', 'pull', '--ff-only', '--quiet', 'origin', BRANCH] });
};

const main = async (): Promise<void> => {
  // `seeded`: resuming a chain that stopped - the packages an earlier run already published, so the
  // next ones trust their workspace version instead of waiting for npm to show them.
  const { isDryRun, isConfirmed, mode, seeded, issue, named } = parseReleaseArgs(Bun.argv.slice(2));
  const unknownNames = named.filter(name => !RELEASE_ORDER.includes(name as never));
  if (unknownNames.length > 0) {
    throw new Error(
      `Unknown package(s): ${unknownNames.join(', ')}. Known: ${RELEASE_ORDER.join(', ')}`,
    );
  }
  // A name means "from here on": the package and everything after it in the chain, so a consumer
  // never gets a new package beside a stale one that depends on it.
  const start =
    named.length > 0 ? Math.min(...named.map(name => RELEASE_ORDER.indexOf(name as never))) : -1;
  const requested: Array<string> = start >= 0 ? RELEASE_ORDER.slice(start) : [];
  const candidates = requested.length > 0 ? requested : RELEASE_ORDER;

  const unknown = requested.filter(name => !RELEASE_ORDER.includes(name as never));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown package(s): ${unknown.join(', ')}. Known: ${RELEASE_ORDER.join(', ')}`,
    );
  }

  await assertReleasable({ isDryRun });

  const states = await collectState({ names: candidates, distTag: toDistTag({ mode }) });
  // An explicit request is honoured as given; a full sweep releases only what actually changed.
  const plan = requested.length > 0 ? states : states.filter(state => state.changedFiles > 0);

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
    console.log(
      `  ${state.name.padEnd(13)} ${state.localVersion.padEnd(10)} npm:${(state.publishedVersion ?? '-').padEnd(10)} ${changed}`,
    );
  }

  if (isDryRun) {
    console.log('\n--dry-run: nothing dispatched.');
    return;
  }

  if (!isConfirmed) {
    console.log(`\nThis publishes ${plan.length} package(s) to npm. Re-run with --yes to proceed.`);
    return;
  }

  const chainReleased: Array<string> = seeded.map(name =>
    name.startsWith('@') ? name : (states.find(state => state.name === name)?.packageName ?? name),
  );
  for (const state of plan) {
    await releasePackage({ state, mode, issue, chainReleased });
    chainReleased.push(state.packageName);
  }

  console.log(`\n✓ Released ${plan.length} package(s).`);
};

await main();

export {};
