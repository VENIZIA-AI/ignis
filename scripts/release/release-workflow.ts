/**
 * Reads `.github/workflows/package-release.yml` and `scripts/release/release-run.ts` and reports which guards of
 * the release are missing. The workflow is where the release's safety lives (who may write, who holds the publish
 * identity, what runs before a version leaves the building); the script is where the loop lives. A guard that a
 * later edit drops must fail a test, not pass in silence. Each guard has an id; `release-workflow.test.ts`
 * removes them one at a time from a copy and expects this check to name the one removed.
 *
 * What the loop does with the tarball (the checksum, the version inside it, the pins, the order of the calls) is
 * not read from text: `release-run.test.ts` runs it against a fake and mutates it.
 */
export class ReleaseWorkflowGuards {
  static readonly DEVELOP_ONLY = 'develop-only';
  static readonly READ_ONLY_DEFAULT = 'read-only-default';
  static readonly WRITE_ON_PUBLISH_ONLY = 'write-on-publish-only';
  static readonly GATES_NEEDED = 'gates-needed';
  static readonly GATE_JOBS_HOLD_NO_SECRET = 'gate-jobs-hold-no-secret';
  static readonly VULCAN_PINNED = 'vulcan-pinned';
  static readonly BUN_EXACT = 'bun-exact';
  static readonly NO_NPM_TOKEN = 'no-npm-token';
  static readonly ENVIRONMENT_ON_PUBLISH = 'environment-on-publish';
  static readonly OIDC_ON_PUBLISH_ONLY = 'oidc-on-publish-only';
  static readonly NODE_EXACT_NO_CACHE = 'node-exact-no-cache';
  static readonly NPM_EXACT_AND_ASSERTED = 'npm-exact-and-asserted';
  static readonly PUBLISH_TARBALL_WITH_PROVENANCE = 'publish-tarball-with-provenance';
  static readonly CHECKOUT_AT_DISPATCHED_COMMIT = 'checkout-at-dispatched-commit';
  static readonly NO_BRANCH_SYNC = 'no-branch-sync';
  static readonly RUN_NAME_CARRIES_COMMIT = 'run-name-carries-commit';
  static readonly ACTIONS_PINNED_BY_COMMIT = 'actions-pinned-by-commit';
  static readonly UNIT_TESTS_RUN = 'unit-tests-run';
  static readonly SCRIPT_TESTS_RUN = 'script-tests-run';
  static readonly ONE_PLAN_INPUT = 'one-plan-input';
  static readonly DEFAULT_MODE_PRERELEASE = 'default-mode-prerelease';
  static readonly PLAN_JOB_FIRST = 'plan-job-first';
  static readonly MATRIX_OVER_PLAN = 'matrix-over-plan';
  static readonly BUILD_ONCE = 'build-once';
  static readonly PUBLISH_RUNS_THE_LOOP = 'publish-runs-the-loop';
  static readonly NO_INTERPOLATION_IN_RUN = 'no-interpolation-in-run';
  static readonly PUBLISH_TIMEOUT = 'publish-timeout';

  static readonly SCHEME_SET = new Set<string>([
    this.DEVELOP_ONLY,
    this.READ_ONLY_DEFAULT,
    this.WRITE_ON_PUBLISH_ONLY,
    this.GATES_NEEDED,
    this.GATE_JOBS_HOLD_NO_SECRET,
    this.VULCAN_PINNED,
    this.BUN_EXACT,
    this.NO_NPM_TOKEN,
    this.ENVIRONMENT_ON_PUBLISH,
    this.OIDC_ON_PUBLISH_ONLY,
    this.NODE_EXACT_NO_CACHE,
    this.NPM_EXACT_AND_ASSERTED,
    this.PUBLISH_TARBALL_WITH_PROVENANCE,
    this.CHECKOUT_AT_DISPATCHED_COMMIT,
    this.NO_BRANCH_SYNC,
    this.RUN_NAME_CARRIES_COMMIT,
    this.ACTIONS_PINNED_BY_COMMIT,
    this.UNIT_TESTS_RUN,
    this.SCRIPT_TESTS_RUN,
    this.ONE_PLAN_INPUT,
    this.DEFAULT_MODE_PRERELEASE,
    this.PLAN_JOB_FIRST,
    this.MATRIX_OVER_PLAN,
    this.BUILD_ONCE,
    this.PUBLISH_RUNS_THE_LOOP,
    this.NO_INTERPOLATION_IN_RUN,
    this.PUBLISH_TIMEOUT,
  ]);
}

export interface IReleaseWorkflowViolation {
  guard: string;
  message: string;
}

interface IWorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface IWorkflowJob {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string> | string;
  environment?: unknown;
  outputs?: Record<string, unknown>;
  strategy?: { matrix?: unknown };
  env?: Record<string, unknown>;
  'timeout-minutes'?: unknown;
  steps?: IWorkflowStep[];
}

interface IWorkflow {
  'run-name'?: string;
  on?: { workflow_dispatch?: { inputs?: Record<string, { default?: unknown }> } };
  permissions?: Record<string, string> | string;
  jobs?: Record<string, IWorkflowJob>;
}

const PLAN_JOB = 'plan';
const TEST_JOB = 'test';
const SCRIPTS_JOB = 'scripts';
const PUBLISH_JOB = 'publish';
const GATE_JOBS = [PLAN_JOB, TEST_JOB, SCRIPTS_JOB];
const DEVELOP_CONDITION = "github.ref == 'refs/heads/develop'";
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const FULL_COMMIT = /@[0-9a-f]{40}$/;
const RELEASE_ENVIRONMENT = 'npm-release';
const NPM_TOKEN_NAMES = ['NPM_ACCESS_TOKEN', 'NPM_CONFIG_TOKEN', 'NODE_AUTH_TOKEN'];
const SECRET_REFERENCE = 'secrets.';
const EXACT_NPM = /npm install (?:--global|-g) npm@(\d+\.\d+\.\d+)(?:\s|$)/;
/** The first npm that moves a dist-tag over OIDC; publishing needs 11.5.1. */
const MINIMUM_NPM = '11.21.0';
const INSTALL_NPM_STEP = 'Install the npm that publishes';
const RELEASE_STEP = 'Release the plan';
const RELEASE_COMMAND = 'bun scripts/release/release-run.ts run';
const PLAN_INPUTS = ['build_mode', 'issue', 'plan'];
const MATRIX_EXPRESSION = '${{ fromJSON(needs.plan.outputs.matrix) }}';
const BUILD_COMMAND = 'make core-server core-worker boot';
const MINIMUM_TIMEOUT = 180;
const MAXIMUM_TIMEOUT = 360;

/** A comment names the commands without running them: every guard on a command reads the text without them. */
const withoutComments = (text: string): string => text.replace(/(^|[ \t])#.*$/gm, '');

/** The same for the script: a `//` comment that starts a line or follows a space (a URL's `//` follows a colon). */
const withoutScriptComments = (text: string): string => text.replace(/(^|[ \t])\/\/.*$/gm, '');

const commandsOf = (step: IWorkflowStep | undefined): string => withoutComments(step?.run ?? '');

const stepsOf = (job: IWorkflowJob | undefined): IWorkflowStep[] => job?.steps ?? [];

const needsOf = (job: IWorkflowJob | undefined): string[] => {
  const needs = job?.needs;
  if (needs === undefined) {
    return [];
  }

  return Array.isArray(needs) ? needs : [needs];
};

const writesOf = (job: IWorkflowJob | undefined): boolean =>
  typeof job?.permissions === 'object' &&
  Object.values(job.permissions).some((level) => level === 'write');

const hasOidc = (permissions: unknown): boolean =>
  typeof permissions === 'object' && permissions !== null && 'id-token' in permissions;

/**
 * Every guard that does not hold, empty when the workflow and the loop are as hardened as the release requires.
 * `runnerText` is `scripts/release/release-run.ts`.
 */
export const checkReleaseWorkflow = (opts: {
  text: string;
  runnerText: string;
}): IReleaseWorkflowViolation[] => {
  const { text, runnerText } = opts;
  const violations: IReleaseWorkflowViolation[] = [];
  const violate = (guard: string, message: string): void => {
    violations.push({ guard, message });
  };

  const workflow = Bun.YAML.parse(text) as IWorkflow;
  const jobs = workflow.jobs ?? {};
  const allSteps = Object.values(jobs).flatMap(stepsOf);
  const plan = jobs[PLAN_JOB];
  const test = jobs[TEST_JOB];
  const scripts = jobs[SCRIPTS_JOB];
  const publish = jobs[PUBLISH_JOB];

  if (publish?.if?.replaceAll(/\s+/g, ' ').trim() !== DEVELOP_CONDITION) {
    violate(
      ReleaseWorkflowGuards.DEVELOP_ONLY,
      `the '${PUBLISH_JOB}' job must carry \`if: ${DEVELOP_CONDITION}\``,
    );
  }

  const defaults = workflow.permissions;
  if (
    typeof defaults !== 'object' ||
    defaults?.contents !== 'read' ||
    Object.keys(defaults).length !== 1
  ) {
    violate(
      ReleaseWorkflowGuards.READ_ONLY_DEFAULT,
      'the workflow default must be `permissions: { contents: read }` and nothing else',
    );
  }

  const publishPermissions = publish?.permissions;
  const writers = Object.entries(jobs)
    .filter(([name, job]) => name !== PUBLISH_JOB && writesOf(job))
    .map(([name]) => name);
  if (
    typeof publishPermissions !== 'object' ||
    publishPermissions?.contents !== 'write' ||
    writers.length > 0
  ) {
    violate(
      ReleaseWorkflowGuards.WRITE_ON_PUBLISH_ONLY,
      `only the '${PUBLISH_JOB}' job may write, and it must state \`contents: write\`${writers.length > 0 ? ` (also writing: ${writers.join(', ')})` : ''}`,
    );
  }

  const missingGates = GATE_JOBS.filter((name) => !needsOf(publish).includes(name));
  if (missingGates.length > 0) {
    violate(
      ReleaseWorkflowGuards.GATES_NEEDED,
      `the '${PUBLISH_JOB}' job must \`needs\` every gate job: missing ${missingGates.join(', ')}`,
    );
  }

  for (const name of GATE_JOBS) {
    const job = jobs[name];
    const permissions = job?.permissions;
    if (
      !job ||
      JSON.stringify(job).includes('secrets.') ||
      job.environment !== undefined ||
      writesOf(job) ||
      typeof permissions !== 'object'
    ) {
      violate(
        ReleaseWorkflowGuards.GATE_JOBS_HOLD_NO_SECRET,
        `the '${name}' job must exist, state read-only permissions, name no environment and reference no secret`,
      );
    }
  }

  const smoke = stepsOf(test).find((step) => step.run?.includes('make preset-smoke'));
  const smokeCommand = smoke?.run ?? '';
  if (
    !smoke ||
    !smokeCommand.includes('VULCAN_CMD="bun x @venizia/vulcan@$(') ||
    !smokeCommand.includes('devDependencies["@venizia/vulcan"]') ||
    text.includes('@latest')
  ) {
    violate(
      ReleaseWorkflowGuards.VULCAN_PINNED,
      'the preset smoke must run through `VULCAN_CMD` with the version of `devDependencies["@venizia/vulcan"]`, and `@latest` must appear nowhere in the workflow',
    );
  }

  const bunSteps = allSteps.filter((step) => step.uses?.startsWith('oven-sh/setup-bun@'));
  if (
    bunSteps.length === 0 ||
    bunSteps.some((step) => !EXACT_VERSION.test(String(step.with?.['bun-version'] ?? '')))
  ) {
    violate(
      ReleaseWorkflowGuards.BUN_EXACT,
      'every setup-bun step must state an exact `bun-version` (x.y.z), never `latest`',
    );
  }

  const otherOidc = Object.entries(jobs)
    .filter(([name, job]) => name !== PUBLISH_JOB && hasOidc(job.permissions))
    .map(([name]) => name);
  if (
    typeof publishPermissions !== 'object' ||
    publishPermissions?.['id-token'] !== 'write' ||
    hasOidc(defaults) ||
    otherOidc.length > 0
  ) {
    violate(
      ReleaseWorkflowGuards.OIDC_ON_PUBLISH_ONLY,
      `only the '${PUBLISH_JOB}' job may hold \`id-token\`, and it must state \`id-token: write\`: that is what the trusted publisher signs in with`,
    );
  }

  if (publish?.environment !== RELEASE_ENVIRONMENT) {
    violate(
      ReleaseWorkflowGuards.ENVIRONMENT_ON_PUBLISH,
      `the '${PUBLISH_JOB}' job must name \`environment: ${RELEASE_ENVIRONMENT}\`: its ref rule is what a run waits on, and the trusted publisher names it`,
    );
  }

  const tokenScans: Array<{ label: string; lines: string[] }> = [
    { label: 'the workflow', lines: withoutComments(text).split('\n') },
    { label: 'release-run.ts', lines: withoutScriptComments(runnerText).split('\n') },
  ];
  for (const { label, lines } of tokenScans) {
    for (const [index, line] of lines.entries()) {
      const leaked = [SECRET_REFERENCE, ...NPM_TOKEN_NAMES].find((name) => line.includes(name));
      if (leaked !== undefined) {
        violate(
          ReleaseWorkflowGuards.NO_NPM_TOKEN,
          `${label}, line ${index + 1} names \`${leaked}\`; the release holds no secret and no npm token, it publishes through trusted publishing`,
        );
      }
    }
  }

  const nodeSteps = allSteps.filter((step) => step.uses?.startsWith('actions/setup-node@'));
  if (
    nodeSteps.length === 0 ||
    nodeSteps.some(
      (step) =>
        !EXACT_VERSION.test(String(step.with?.['node-version'] ?? '')) ||
        step.with?.['package-manager-cache'] !== false,
    )
  ) {
    violate(
      ReleaseWorkflowGuards.NODE_EXACT_NO_CACHE,
      'every setup-node step must state an exact `node-version` (x.y.z) and `package-manager-cache: false`',
    );
  }

  const install = stepsOf(publish).find((step) => step.name === INSTALL_NPM_STEP);
  const installedNpm = EXACT_NPM.exec(commandsOf(install))?.[1];
  if (
    installedNpm === undefined ||
    Bun.semver.order(installedNpm, MINIMUM_NPM) < 0 ||
    !commandsOf(install).includes('npm --version')
  ) {
    violate(
      ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      `'${INSTALL_NPM_STEP}' must install an exact npm of at least ${MINIMUM_NPM} and assert it with \`npm --version\``,
    );
  }

  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of stepsOf(job).filter((entry) => commandsOf(entry).includes('bun publish'))) {
      violate(
        ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
        `'${step.name}' (${jobName}) runs \`bun publish\`; bun has no trusted publishing, npm publishes a tarball bun packed`,
      );
    }
  }

  const runner = withoutScriptComments(runnerText);
  if (/'bun',\s*'publish'/.test(runner)) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      'release-run.ts runs `bun publish`; bun has no trusted publishing, npm publishes a tarball bun packed',
    );
  }
  if (!/'npm',\s*'publish'/.test(runner) || !runner.includes("'--provenance'")) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      'release-run.ts must run `npm publish` of the packed tarball with `--provenance`',
    );
  }
  if (!/'bun',\s*'pm',\s*'pack'/.test(runner)) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      'release-run.ts must pack with `bun pm pack`: only bun resolves `catalog:` and `workspace:`, npm ships them verbatim',
    );
  }

  const checkouts = allSteps.filter((step) => step.uses?.startsWith('actions/checkout@'));
  if (
    checkouts.length === 0 ||
    checkouts.some((step) => String(step.with?.ref ?? '').trim() !== '${{ github.sha }}')
  ) {
    violate(
      ReleaseWorkflowGuards.CHECKOUT_AT_DISPATCHED_COMMIT,
      'every checkout must use `ref: ${{ github.sha }}`, never a branch name',
    );
  }

  const syncsBranch = allSteps.some((step) =>
    /git checkout develop|git pull origin develop|git pull --ff-only|git pull --rebase|git rebase/.test(
      step.run ?? '',
    ),
  );
  if (syncsBranch || /'(pull|rebase)'/.test(runner)) {
    violate(
      ReleaseWorkflowGuards.NO_BRANCH_SYNC,
      'no step and no part of the loop may move to the tip of a branch or rebase onto it: the release works on the dispatched commit, and a rejected push stops the run',
    );
  }

  if (!String(workflow['run-name'] ?? '').includes('github.sha')) {
    violate(
      ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      'the `run-name` must carry the dispatched commit (`github.sha`)',
    );
  }

  const unpinned = allSteps.filter(
    (step) => step.uses !== undefined && !FULL_COMMIT.test(step.uses),
  );
  if (unpinned.length > 0) {
    violate(
      ReleaseWorkflowGuards.ACTIONS_PINNED_BY_COMMIT,
      `every action must be pinned by a full commit: ${unpinned.map((step) => step.uses).join(', ')}`,
    );
  }

  if (!stepsOf(test).some((step) => /make test-\$PACKAGE/.test(step.run ?? ''))) {
    violate(
      ReleaseWorkflowGuards.UNIT_TESTS_RUN,
      `the '${TEST_JOB}' job must run the package's unit tests (\`make test-$PACKAGE\`)`,
    );
  }

  if (!stepsOf(scripts).some((step) => commandsOf(step).includes('make test-scripts'))) {
    violate(
      ReleaseWorkflowGuards.SCRIPT_TESTS_RUN,
      `the '${SCRIPTS_JOB}' job must run the repository scripts' tests (\`make test-scripts\`): they hold these guards`,
    );
  }

  const inputs = workflow.on?.workflow_dispatch?.inputs ?? {};
  if (JSON.stringify(Object.keys(inputs).sort()) !== JSON.stringify(PLAN_INPUTS)) {
    violate(
      ReleaseWorkflowGuards.ONE_PLAN_INPUT,
      `the dispatch inputs must be exactly ${PLAN_INPUTS.join(', ')}: one run takes the whole plan, no \`package\`, \`dependencies_from\` or \`chain_released\``,
    );
  }

  if (inputs.build_mode?.default !== 'prerelease') {
    violate(
      ReleaseWorkflowGuards.DEFAULT_MODE_PRERELEASE,
      'the `build_mode` input must default to `prerelease`: a dispatch that names no mode must not publish under `latest`',
    );
  }

  if (
    !plan ||
    needsOf(plan).length > 0 ||
    plan.environment !== undefined ||
    plan.outputs?.matrix === undefined ||
    plan.outputs?.plan === undefined ||
    !needsOf(test).includes(PLAN_JOB) ||
    !needsOf(scripts).includes(PLAN_JOB)
  ) {
    violate(
      ReleaseWorkflowGuards.PLAN_JOB_FIRST,
      `the '${PLAN_JOB}' job must run first with no environment, output \`matrix\` and \`plan\`, and the '${TEST_JOB}' and '${SCRIPTS_JOB}' jobs must \`needs\` it`,
    );
  }

  if (
    test?.strategy?.matrix !== MATRIX_EXPRESSION ||
    test?.env?.PACKAGE !== '${{ matrix.package }}'
  ) {
    violate(
      ReleaseWorkflowGuards.MATRIX_OVER_PLAN,
      `the '${TEST_JOB}' job must run one job per package of the plan: \`matrix: ${MATRIX_EXPRESSION}\` and \`PACKAGE: \${{ matrix.package }}\``,
    );
  }

  const makeSteps = stepsOf(publish).filter((step) => commandsOf(step).includes('make '));
  if (
    makeSteps.length !== 1 ||
    !commandsOf(makeSteps[0]).includes(BUILD_COMMAND) ||
    stepsOf(publish).some((step) => commandsOf(step).includes('$PACKAGE'))
  ) {
    violate(
      ReleaseWorkflowGuards.BUILD_ONCE,
      `the '${PUBLISH_JOB}' job must build once, for every package (\`${BUILD_COMMAND}\`), and name no single \`$PACKAGE\``,
    );
  }

  const publishSteps = stepsOf(publish);
  const release = publishSteps.find((step) => step.name === RELEASE_STEP);
  if (
    !release ||
    commandsOf(release).trim() !== RELEASE_COMMAND ||
    release.env?.PLAN !== '${{ needs.plan.outputs.plan }}' ||
    publishSteps[publishSteps.length - 1] !== release
  ) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      `'${RELEASE_STEP}' must be the last step of '${PUBLISH_JOB}', run \`${RELEASE_COMMAND}\` and take \`PLAN\` from the plan job's output`,
    );
  }

  const interpolating = allSteps.filter((step) => (step.run ?? '').includes('${{'));
  if (interpolating.length > 0) {
    violate(
      ReleaseWorkflowGuards.NO_INTERPOLATION_IN_RUN,
      `no \`run:\` may interpolate \`\${{ }}\` (dispatch input is text anybody with write access types): pass it through \`env\`. Offending: ${interpolating.map((step) => step.name).join(', ')}`,
    );
  }

  const timeout = publish?.['timeout-minutes'];
  if (typeof timeout !== 'number' || timeout < MINIMUM_TIMEOUT || timeout > MAXIMUM_TIMEOUT) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TIMEOUT,
      `the '${PUBLISH_JOB}' job must state \`timeout-minutes\` between ${MINIMUM_TIMEOUT} and ${MAXIMUM_TIMEOUT}: nine publishes, each followed by a wait of up to fifteen minutes`,
    );
  }

  return violations;
};
