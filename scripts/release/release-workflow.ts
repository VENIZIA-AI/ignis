import { ReleasePublishCondition } from './release-publish-condition';

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
  static readonly REF_BY_KIND = 'ref-by-kind';
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
  static readonly APPROVE_FOR_STABLE_ONLY = 'approve-for-stable-only';
  static readonly PUBLISH_AFTER_APPROVE = 'publish-after-approve';
  static readonly STABLE_REFUSES_MOVED_BRANCHES = 'stable-refuses-moved-branches';
  static readonly PLAN_TRIES_THE_MERGE_BACK = 'plan-tries-the-merge-back';
  static readonly MERGE_BACK_FROM_A_COPY = 'merge-back-from-a-copy';
  static readonly TARGET_BRANCH_BY_KIND = 'target-branch-by-kind';
  static readonly NO_FORCE_OR_TAG_MOVE = 'no-force-or-tag-move';
  static readonly PLAN_CHECKS_THE_LABEL = 'plan-checks-the-label';
  static readonly GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH = 'github-release-never-fails-a-publish';
  static readonly GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES = 'github-release-only-views-and-creates';

  static readonly SCHEME_SET = new Set<string>([
    this.REF_BY_KIND,
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
    this.APPROVE_FOR_STABLE_ONLY,
    this.PUBLISH_AFTER_APPROVE,
    this.STABLE_REFUSES_MOVED_BRANCHES,
    this.PLAN_TRIES_THE_MERGE_BACK,
    this.MERGE_BACK_FROM_A_COPY,
    this.TARGET_BRANCH_BY_KIND,
    this.NO_FORCE_OR_TAG_MOVE,
    this.PLAN_CHECKS_THE_LABEL,
    this.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
    this.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
  ]);
}

export interface IReleaseWorkflowViolation {
  guard: string;
  message: string;
}

interface IWorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  'continue-on-error'?: unknown;
  'timeout-minutes'?: unknown;
}

interface IWorkflowJob {
  name?: string;
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
  env?: Record<string, unknown>;
  jobs?: Record<string, IWorkflowJob>;
}

const PLAN_JOB = 'plan';
const TEST_JOB = 'test';
const SCRIPTS_JOB = 'scripts';
const PUBLISH_JOB = 'publish';
const APPROVE_JOB = 'approve';
const GATE_JOBS = [PLAN_JOB, TEST_JOB, SCRIPTS_JOB];
const STABLE_CONDITION = "${{ needs.plan.outputs.kind == 'stable' }}";
const APPROVAL_ENVIRONMENT = 'release-approval';
const MOVED_BRANCHES_STEP = 'Refuse a stable when a branch moved since the plan';
const TRIAL_STEP = 'Try the merge back into develop';
const MERGE_BACK_STEP = 'Merge main back into develop';
const REPORT_STEP = 'Report - published, merge back not done';
const GITHUB_RELEASE_STEP = 'Create the GitHub Release';
const GITHUB_RELEASE_COMMAND =
  'bun scripts/release/github-release.ts create --targets "$TARGETS" --kind "$RELEASE_KIND"';
/** The only keys the step has: no `if`, `shell`, `uses`, `with`, `id` or `working-directory` to change what runs or when. */
const GITHUB_RELEASE_KEYS = ['continue-on-error', 'env', 'name', 'run', 'timeout-minutes'];
const GITHUB_RELEASE_ENV = ['GH_TOKEN', 'RELEASE_KIND', 'TARGETS'];
const MAXIMUM_GITHUB_RELEASE_TIMEOUT = 10;
/** The `gh` and `git` commands scripts/release/github-release.ts may issue: it views and creates, nothing else. */
const GITHUB_RELEASE_COMMANDS = ['release view', 'release create', 'tag', 'log', 'show'];
const GITHUB_RELEASE_ARGS = /\bargs:\s*\[\s*'([\w-]+)'(?:,\s*'([\w-]+)')?/g;
const FORCING_FLAG = /'(?:--force|--force-with-lease|-f|--delete|-d|-D)'/;
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
const PLAN_INPUTS = ['build_mode', 'issue', 'label', 'plan'];
/** The whole run name is one expression: the label, or for a dispatch by hand the mode and the whole commit. */
const RUN_NAME_EXPRESSION = /\$\{\{\s*inputs\.label\s*\|\|[\s\S]*github\.sha[\s\S]*\}\}\s*$/;
const MATRIX_EXPRESSION = '${{ fromJSON(needs.plan.outputs.matrix) }}';
const BUILD_COMMAND = 'make core-server core-worker boot';
/** A git command that rewrites or removes history a release has already made public. */
const DESTRUCTIVE_GIT: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'a forced push',
    pattern: /\bgit\b[^\n]*?\bpush\b[^\n]*(?:--force|--force-with-lease|\s-f\b|\s\+\S)/,
  },
  {
    name: 'a push that deletes a ref',
    pattern: /\bgit\b[^\n]*?\bpush\b[^\n]*(?:--delete|\s-d\b|\s:\S)/,
  },
  {
    name: 'a tag moved or deleted',
    pattern: /\bgit\b[^\n]*?\btag\b[^\n]*(?:\s-f\b|--force|\s-d\b|--delete)/,
  },
  { name: 'a branch deleted', pattern: /\bgit\b[^\n]*?\bbranch\b[^\n]*(?:\s-D\b|\s-d\b|--delete)/ },
];
const MINIMUM_TIMEOUT = 180;
const MAXIMUM_TIMEOUT = 360;

/** A comment names the commands without running them: every guard on a command reads the text without them. */
const withoutComments = (text: string): string => text.replace(/(^|[ \t])#.*$/gm, '');

/** The same for the script: a `//` comment that starts a line or follows a space (a URL's `//` follows a colon). */
const withoutScriptComments = (text: string): string => text.replace(/(^|[ \t])\/\/.*$/gm, '');

/** The same for a script's block comments, which name commands it does not run; the lines keep their numbers. */
const withoutBlockComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''));

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
 * `runnerText` is `scripts/release/release-run.ts`, `releaseScriptText` is `scripts/release/github-release.ts`.
 */
export const checkReleaseWorkflow = (opts: {
  text: string;
  runnerText: string;
  releaseScriptText: string;
}): IReleaseWorkflowViolation[] => {
  const { text, runnerText, releaseScriptText } = opts;
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

  const planStep = stepsOf(plan).find((step) => commandsOf(step).includes('release-run.ts plan'));
  if (
    planStep === undefined ||
    workflow.env?.BUILD_MODE !== '${{ github.event.inputs.build_mode }}' ||
    (publish?.if ?? '').includes('github.ref')
  ) {
    violate(
      ReleaseWorkflowGuards.REF_BY_KIND,
      `the ref is checked by the plan job, not by a hard-coded branch: '${PLAN_JOB}' must run \`release-run.ts plan\` with the \`BUILD_MODE\` of the dispatch (the plan reads GITHUB_REF and refuses a ref that is not the branch of the kind), and the '${PUBLISH_JOB}' condition must not name a ref`,
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

  const missingGates = [...GATE_JOBS, APPROVE_JOB].filter(
    (name) => !needsOf(publish).includes(name),
  );
  if (missingGates.length > 0) {
    violate(
      ReleaseWorkflowGuards.GATES_NEEDED,
      `the '${PUBLISH_JOB}' job must \`needs\` every gate job and the approval: missing ${missingGates.join(', ')}`,
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
    {
      label: 'github-release.ts',
      lines: withoutBlockComments(withoutScriptComments(releaseScriptText)).split('\n'),
    },
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

  // The title is the dispatcher's label, which ends in the short commit and which the plan job checks, or the whole
  // commit for a dispatch by hand: one expression, so a mention of the two names in plain text does not count.
  if (!RUN_NAME_EXPRESSION.test(String(workflow['run-name'] ?? ''))) {
    violate(
      ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      'the `run-name` must carry the dispatched commit: one expression, `${{ inputs.label || ... github.sha ... }}`, the label (which ends in the short commit) and, for a dispatch by hand, the whole commit',
    );
  }

  const planChecksTheLabel =
    stepsOf(plan).some(
      (step) =>
        commandsOf(step).includes('release-run.ts plan') &&
        step.env?.RELEASE_LABEL === '${{ inputs.label }}' &&
        step.env?.RELEASE_ISSUE === '${{ inputs.issue }}',
    ) &&
    /process\.env\.RELEASE_LABEL/.test(runner) &&
    /ReleaseTargets\.labelProblems/.test(runner) &&
    // What the check finds must stop the job, and the issue that goes into the title must be digits.
    /labelProblems\.length > 0\) \{\s*throw /.test(runner) &&
    /\!\/\^\\d\*\$\/\.test\(issue\)\) \{\s*throw /.test(runner) &&
    // The label is read in two places and no other: the run name and the plan step. A third reader would trust it,
    // whatever way it is spelled (`inputs['label']`, the whole `inputs` object as JSON).
    withoutComments(text).split('inputs.label').length - 1 === 2 &&
    !/inputs\[|toJSON\(\s*(?:github\.event\.)?inputs\b/.test(withoutComments(text)) &&
    // A plan job that may fail and go on would let a refused label through.
    !JSON.stringify(plan).includes('continue-on-error');
  if (!planChecksTheLabel) {
    violate(
      ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      'the plan step must receive `label` and `issue` from the dispatch inputs (`RELEASE_LABEL`, `RELEASE_ISSUE`), `release-run.ts plan` must refuse a label that is not the one it computes, `inputs.label` is read by the run name and the plan step only, and the plan job has no `continue-on-error`: the run title cannot name a release the run does not make',
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
    plan.outputs?.kind === undefined ||
    plan.outputs?.branch === undefined ||
    plan.outputs?.headline === undefined ||
    !needsOf(test).includes(PLAN_JOB) ||
    !needsOf(scripts).includes(PLAN_JOB)
  ) {
    violate(
      ReleaseWorkflowGuards.PLAN_JOB_FIRST,
      `the '${PLAN_JOB}' job must run first with no environment, output \`matrix\`, \`plan\`, \`kind\`, \`branch\` and \`headline\`, and the '${TEST_JOB}' and '${SCRIPTS_JOB}' jobs must \`needs\` it`,
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
  const afterLoop =
    release === undefined ? [] : publishSteps.slice(publishSteps.indexOf(release) + 1);
  // A step is found by its name: a second step of the same name would be the one that runs unchecked.
  const names = publishSteps.map((step) => step.name);
  const repeated = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (
    repeated.length > 0 ||
    !release ||
    commandsOf(release).trim() !== RELEASE_COMMAND ||
    release.env?.PLAN !== '${{ needs.plan.outputs.plan }}' ||
    afterLoop.some(
      (step) =>
        step.name !== GITHUB_RELEASE_STEP &&
        step.name !== MERGE_BACK_STEP &&
        step.name !== REPORT_STEP,
    )
  ) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      `'${RELEASE_STEP}' must run \`${RELEASE_COMMAND}\`, take \`PLAN\` from the plan job's output and be followed only by '${GITHUB_RELEASE_STEP}', '${MERGE_BACK_STEP}' and '${REPORT_STEP}'; no two steps of the '${PUBLISH_JOB}' job share a name${repeated.length > 0 ? ` (repeated: ${repeated.join(', ')})` : ''}`,
    );
  }

  if (release?.env?.TARGET_BRANCH !== '${{ needs.plan.outputs.branch }}') {
    violate(
      ReleaseWorkflowGuards.TARGET_BRANCH_BY_KIND,
      `'${RELEASE_STEP}' must take \`TARGET_BRANCH\` from \`needs.plan.outputs.branch\`: the branch of the kind, never a literal`,
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

  // The approval: one job names the environment, it exists for a stable only, it follows every gate, it holds no
  // permission and it runs nothing but an echo.
  const approvers = Object.entries(jobs)
    .filter(([, job]) => job.environment === APPROVAL_ENVIRONMENT)
    .map(([name]) => name);
  const approve = jobs[APPROVE_JOB];
  const approveSteps = stepsOf(approve);
  if (
    approvers.length !== 1 ||
    approvers[0] !== APPROVE_JOB ||
    approve?.if?.trim() !== STABLE_CONDITION ||
    [...GATE_JOBS].some((name) => !needsOf(approve).includes(name)) ||
    typeof approve?.permissions !== 'object' ||
    Object.keys(approve.permissions).length > 0 ||
    approveSteps.length !== 1 ||
    approveSteps[0].uses !== undefined ||
    !(approveSteps[0].run ?? '').trim().startsWith('echo ') ||
    !String(approve.name ?? '').includes('needs.plan.outputs.headline')
  ) {
    violate(
      ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      `exactly one job ('${APPROVE_JOB}') names \`environment: ${APPROVAL_ENVIRONMENT}\`; it runs only for a stable (\`if: ${STABLE_CONDITION}\`), \`needs\` ${GATE_JOBS.join(', ')}, states \`permissions: {}\`, runs one echo step and carries \`needs.plan.outputs.headline\` in its name`,
    );
  }

  // The publish condition is evaluated, not read: a prerelease publishes with the approval skipped, a stable only
  // after it succeeded, and nothing publishes after a failed or cancelled dependency.
  const failures = ReleasePublishCondition.failures({ condition: publish?.if ?? '' });
  if (failures.length > 0) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      `the '${PUBLISH_JOB}' condition is wrong for: ${failures.join('; ')}`,
    );
  }

  // A stable is approved against the branches the plan saw; the refusal comes before anything changes a file,
  // writes git or publishes.
  const moved = publishSteps.find((step) => step.name === MOVED_BRANCHES_STEP);
  const firstMutation = publishSteps.findIndex((step) =>
    /bun install|force-update|make |release-run\.ts|git push|git commit|npm publish/.test(
      commandsOf(step),
    ),
  );
  if (
    !moved ||
    moved.if?.trim() !== STABLE_CONDITION ||
    moved.env?.PLAN_DEVELOP_SHA !== '${{ needs.plan.outputs.develop_sha }}' ||
    !commandsOf(moved).includes('[ "$(git rev-parse origin/main)" != "$GITHUB_SHA" ]') ||
    !commandsOf(moved).includes('[ "$(git rev-parse origin/develop)" != "$PLAN_DEVELOP_SHA" ]') ||
    (commandsOf(moved).match(/\bexit 1\b/g) ?? []).length < 2 ||
    (firstMutation >= 0 && publishSteps.indexOf(moved) > firstMutation)
  ) {
    violate(
      ReleaseWorkflowGuards.STABLE_REFUSES_MOVED_BRANCHES,
      `'${MOVED_BRANCHES_STEP}' must run for a stable, compare origin/main with the dispatched commit and origin/develop with the plan's \`develop_sha\`, and come before the first step that changes a file, writes git or publishes`,
    );
  }

  // The plan job tries the merge before the approval, with the versions of the plan and without the lockfile.
  const trial = stepsOf(plan).find((step) => step.name === TRIAL_STEP);
  const planCheckout = stepsOf(plan).find((step) => step.uses?.startsWith('actions/checkout@'));
  if (
    !trial ||
    trial.if?.trim() !== "${{ steps.plan.outputs.kind == 'stable' }}" ||
    !commandsOf(trial).includes('scripts/release/merge-back.ts trial') ||
    !commandsOf(trial).includes('--versions "$TARGETS"') ||
    !commandsOf(trial).includes('--lock keep') ||
    trial.env?.TARGETS !== '${{ steps.plan.outputs.targets }}' ||
    String(plan?.outputs?.develop_sha ?? '') !== `\${{ steps.${trial.id}.outputs.develop_sha }}` ||
    planCheckout?.with?.['fetch-depth'] !== 0
  ) {
    violate(
      ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      `the '${PLAN_JOB}' job must check out the full history, run '${TRIAL_STEP}' for a stable (\`merge-back.ts trial --versions "$TARGETS" --lock keep\`) and output that step's \`develop_sha\``,
    );
  }

  // The merge back runs once, for a stable, after the loop, from a copy of the script made first, in a worktree of
  // develop of its own.
  const merge = publishSteps.find((step) => step.name === MERGE_BACK_STEP);
  const mergeCommands = commandsOf(merge);
  const mergeOrder = [
    'cp scripts/release/merge-back.ts "$RUNNER_TEMP/merge-back.ts"',
    'git worktree add --detach "$RUNNER_TEMP/develop-merge" origin/develop',
    'bun "$RUNNER_TEMP/merge-back.ts" apply --repo "$RUNNER_TEMP/develop-merge" --from "$RELEASE_SHA"',
    'git -C "$RUNNER_TEMP/develop-merge" push origin HEAD:develop',
  ].map((needle) => mergeCommands.indexOf(needle));
  if (
    !merge ||
    merge.if?.trim() !== STABLE_CONDITION ||
    mergeOrder.some(
      (position, index) => position < 0 || (index > 0 && position < mergeOrder[index - 1]),
    ) ||
    release === undefined ||
    publishSteps.indexOf(merge) < publishSteps.indexOf(release) ||
    /git checkout develop|git switch develop/.test(mergeCommands)
  ) {
    violate(
      ReleaseWorkflowGuards.MERGE_BACK_FROM_A_COPY,
      `'${MERGE_BACK_STEP}' must run for a stable after '${RELEASE_STEP}': copy merge-back.ts first, add a detached worktree of origin/develop, run the copy with \`apply --repo\` on that worktree and push from it; the checkout is never switched to develop`,
    );
  }

  // The GitHub Release of the run is made once the loop is done and before the merge back, by a step that cannot fail
  // the run, holds no secret (the job's own token, nothing else) and takes the plan and the kind from the plan job.
  const githubRelease = publishSteps.find((step) => step.name === GITHUB_RELEASE_STEP);
  // The step is pinned, not searched: its one command is exactly the call, it has no key that changes what runs or
  // when (`if`, `shell`, `uses`, `working-directory`), its environment is the three variables and its timeout is short.
  const githubReleasePosition =
    githubRelease === undefined ? -1 : publishSteps.indexOf(githubRelease);
  const githubReleaseTimeout = githubRelease?.['timeout-minutes'];
  if (
    githubRelease === undefined ||
    release === undefined ||
    merge === undefined ||
    githubReleasePosition < publishSteps.indexOf(release) ||
    githubReleasePosition > publishSteps.indexOf(merge) ||
    JSON.stringify(Object.keys(githubRelease).sort()) !== JSON.stringify(GITHUB_RELEASE_KEYS) ||
    githubRelease['continue-on-error'] !== true ||
    typeof githubReleaseTimeout !== 'number' ||
    githubReleaseTimeout < 1 ||
    githubReleaseTimeout > MAXIMUM_GITHUB_RELEASE_TIMEOUT ||
    JSON.stringify(Object.keys(githubRelease.env ?? {}).sort()) !==
      JSON.stringify(GITHUB_RELEASE_ENV) ||
    githubRelease.env?.GH_TOKEN !== '${{ github.token }}' ||
    githubRelease.env?.RELEASE_KIND !== '${{ needs.plan.outputs.kind }}' ||
    githubRelease.env?.TARGETS !== '${{ needs.plan.outputs.targets }}' ||
    JSON.stringify(githubRelease).includes(SECRET_REFERENCE) ||
    commandsOf(githubRelease).trim() !== GITHUB_RELEASE_COMMAND
  ) {
    violate(
      ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      `'${GITHUB_RELEASE_STEP}' must come after '${RELEASE_STEP}' and before '${MERGE_BACK_STEP}', have only the keys ${GITHUB_RELEASE_KEYS.join(', ')} (no \`if\`, \`shell\`, \`uses\` or \`working-directory\`), state \`continue-on-error: true\` and a \`timeout-minutes\` of 1 to ${MAXIMUM_GITHUB_RELEASE_TIMEOUT}, have exactly the variables ${GITHUB_RELEASE_ENV.join(', ')} (\`GH_TOKEN\` from \`github.token\`, the other two from the plan job's outputs), reference no secret, and run exactly \`${GITHUB_RELEASE_COMMAND}\`: a Release that cannot be made must never fail or undo a publish`,
    );
  }

  // The script that makes the Release views and creates, nothing else: no `gh release delete`, `edit` or `upload`, no
  // forcing flag, one process spawn. The `args` it passes are read as text, so a command built another way is noticed
  // by the count of what it spawns.
  const releaseScript = withoutBlockComments(withoutScriptComments(releaseScriptText));
  const releaseScriptCommands = [...releaseScript.matchAll(GITHUB_RELEASE_ARGS)].map((match) =>
    match[1] === 'release' ? `release ${match[2] ?? ''}` : (match[1] ?? ''),
  );
  const strayCommands = releaseScriptCommands.filter(
    (command) => !GITHUB_RELEASE_COMMANDS.includes(command),
  );
  if (
    strayCommands.length > 0 ||
    !releaseScriptCommands.includes('release view') ||
    !releaseScriptCommands.includes('release create') ||
    (releaseScript.match(/\bBun\.spawn(?:Sync)?\(/g) ?? []).length !== 1
  ) {
    violate(
      ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      `github-release.ts must issue only ${GITHUB_RELEASE_COMMANDS.map((command) => `\`${command}\``).join(', ')}${strayCommands.length > 0 ? ` (also: ${strayCommands.join(', ')})` : ''}, both \`release view\` and \`release create\`, and spawn one process: it never deletes, edits or uploads a release`,
    );
  }

  // Nothing force-pushes, moves or deletes a tag, or deletes a branch: a published version is never chased.
  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of stepsOf(job)) {
      for (const { name } of DESTRUCTIVE_GIT.filter((entry) =>
        entry.pattern.test(commandsOf(step)),
      )) {
        violate(
          ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
          `'${step.name}' (${jobName}) makes ${name}; a release never rewrites or removes what it has published`,
        );
      }
    }
  }
  const gitArrays = [...runner.matchAll(/\[\s*'git'[^\]]*\]/g)].map((match) => match[0]);
  for (const array of gitArrays) {
    if (/'(?:--force|--force-with-lease|-f|--delete|-d|-D)'|'[+:]\S*'/.test(array)) {
      violate(
        ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
        `release-run.ts runs a git command that forces, moves or deletes: ${array.replace(/\s+/g, ' ')}`,
      );
    }
  }

  if (FORCING_FLAG.test(releaseScript)) {
    violate(
      ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      'github-release.ts names a flag that forces or deletes; a release never rewrites or removes what it has published',
    );
  }

  return violations;
};
