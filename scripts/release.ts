/**
 * Drives the NPM Release workflow one package at a time, in dependency order, waiting for each run
 * to finish before dispatching the next.
 *
 * The waiting is the whole point. `package-release.yml` runs `force-update` over the WHOLE workspace
 * (`--filter "@venizia/*"`), so a range that goes stale mid-flight fails the run: a core-worker
 * release once died on a range belonging to core-server, six minutes after a connectors release made
 * it stale. Dispatching by hand invites exactly that.
 *
 *   bun scripts/release.ts                      # every package that needs one, in order
 *   bun scripts/release.ts kernel connectors    # just these, still ordered and still sequential
 *   bun scripts/release.ts --dry-run            # print the plan, dispatch nothing
 *   bun scripts/release.ts --mode patch         # default is prerelease
 *   bun scripts/release.ts --yes                # skip the confirmation prompt
 */

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

type TReleaseMode =
  | 'patch'
  | 'minor'
  | 'major'
  | 'prepatch'
  | 'preminor'
  | 'premajor'
  | 'prerelease';

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

/** The published `next` version, or null when the package has never been released. */
const resolvePublishedVersion = async (opts: { packageName: string }): Promise<string | null> => {
  const { stdout, exitCode } = await run({
    command: ['npm', 'view', `${opts.packageName}@next`, 'version'],
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
  for (const line of committed.split('\n')) {
    if (line) {
      files.add(line);
    }
  }
  for (const line of pending.split('\n')) {
    const path = line.slice(3).trim();
    if (path) {
      files.add(path);
    }
  }

  return files.size;
};

const collectState = async (opts: { names: readonly string[] }): Promise<IPackageState[]> => {
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
      publishedVersion: await resolvePublishedVersion({ packageName: manifest.name }),
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
    complain(`${behind} commit(s) behind origin/${BRANCH}. Pull first, or you will read stale versions.`);
  }
};

/** The most recent run id for this workflow, so a new dispatch can be told apart from it. */
const resolveLatestRunId = async (): Promise<string> => {
  const { stdout } = await run({
    command: ['gh', 'run', 'list', `--workflow=${WORKFLOW}`, '--limit', '1', '--json', 'databaseId'],
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
 * A green workflow is not proof of a publish. Verified against the registry, because the release
 * publishes BEFORE it commits: a run can put a version on npm and still fail afterwards, and the
 * reverse - a green run whose publish silently did nothing - is exactly what this catches.
 */
const assertPublished = async (opts: { state: IPackageState }): Promise<string> => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const published = await resolvePublishedVersion({ packageName: opts.state.packageName });

    if (published && published !== opts.state.publishedVersion) {
      return published;
    }

    await sleep(5_000);
  }

  throw new Error(
    `${opts.state.packageName} still reads ${opts.state.publishedVersion ?? 'nothing'} on the registry. The run was green but nothing new was published.`,
  );
};

const releasePackage = async (opts: { state: IPackageState; mode: TReleaseMode }): Promise<void> => {
  const { state, mode } = opts;

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
    ],
  });

  const runId = await waitForNewRun({ previousRunId });
  console.log(`  run ${runId} - waiting...`);

  const conclusion = await waitForCompletion({ runId });
  if (conclusion !== 'success') {
    throw new Error(`Run ${runId} finished '${conclusion}'. See: gh run view ${runId} --log-failed`);
  }

  const published = await assertPublished({ state });
  console.log(`  published ${state.packageName}@${published}`);

  // The workflow pushes its own release commit. Without this the next package reads a stale local
  // version and the operator reads a repo that disagrees with the registry.
  await run({ command: ['git', 'pull', '--ff-only', '--quiet'] });
};

const main = async (): Promise<void> => {
  const args = Bun.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isConfirmed = args.includes('--yes');
  const modeIndex = args.indexOf('--mode');
  const mode = (modeIndex >= 0 ? args[modeIndex + 1] : 'prerelease') as TReleaseMode;

  const requested = args.filter(arg => !arg.startsWith('--') && arg !== mode);
  const candidates = requested.length > 0 ? RELEASE_ORDER.filter(n => requested.includes(n)) : RELEASE_ORDER;

  const unknown = requested.filter(name => !RELEASE_ORDER.includes(name as never));
  if (unknown.length > 0) {
    throw new Error(`Unknown package(s): ${unknown.join(', ')}. Known: ${RELEASE_ORDER.join(', ')}`);
  }

  await assertReleasable({ isDryRun });

  const states = await collectState({ names: candidates });
  // An explicit request is honoured as given; a full sweep releases only what actually changed.
  const plan = requested.length > 0 ? states : states.filter(state => state.changedFiles > 0);

  if (plan.length === 0) {
    console.log('Nothing to release - no package has source changes since its last release.');
    return;
  }

  console.log(`Release plan (${mode}), in dependency order:\n`);
  for (const state of plan) {
    const changed = state.changedFiles === Number.POSITIVE_INFINITY ? 'never released' : `${state.changedFiles} file(s)`;
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

  for (const state of plan) {
    await releasePackage({ state, mode });
  }

  console.log(`\n✓ Released ${plan.length} package(s).`);
};

await main();
