/**
 * Reads `.github/workflows/package-release.yml` and reports which guards of the release are missing.
 * The workflow is the only place the release's safety lives, so a guard that a later edit drops
 * must fail a test, not pass in silence. Each guard has an id; `release-workflow.test.ts` removes
 * them one at a time from a copy and expects this check to name the one removed.
 */
export class ReleaseWorkflowGuards {
  static readonly DEVELOP_ONLY = 'develop-only';
  static readonly READ_ONLY_DEFAULT = 'read-only-default';
  static readonly WRITE_ON_RELEASE_ONLY = 'write-on-release-only';
  static readonly TEST_JOB_NEEDED = 'test-job-needed';
  static readonly TEST_JOB_HOLDS_NO_SECRET = 'test-job-holds-no-secret';
  static readonly VULCAN_PINNED = 'vulcan-pinned';
  static readonly BUN_EXACT = 'bun-exact';
  static readonly TOKEN_STEPS_ONLY = 'token-steps-only';
  static readonly CHECKOUT_AT_DISPATCHED_COMMIT = 'checkout-at-dispatched-commit';
  static readonly NO_BRANCH_SYNC = 'no-branch-sync';
  static readonly RUN_NAME_CARRIES_COMMIT = 'run-name-carries-commit';
  static readonly ACTIONS_PINNED_BY_COMMIT = 'actions-pinned-by-commit';
  static readonly UNIT_TESTS_RUN = 'unit-tests-run';

  static readonly SCHEME_SET = new Set<string>([
    this.DEVELOP_ONLY,
    this.READ_ONLY_DEFAULT,
    this.WRITE_ON_RELEASE_ONLY,
    this.TEST_JOB_NEEDED,
    this.TEST_JOB_HOLDS_NO_SECRET,
    this.VULCAN_PINNED,
    this.BUN_EXACT,
    this.TOKEN_STEPS_ONLY,
    this.CHECKOUT_AT_DISPATCHED_COMMIT,
    this.NO_BRANCH_SYNC,
    this.RUN_NAME_CARRIES_COMMIT,
    this.ACTIONS_PINNED_BY_COMMIT,
    this.UNIT_TESTS_RUN,
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
  steps?: IWorkflowStep[];
}

interface IWorkflow {
  'run-name'?: string;
  permissions?: Record<string, string> | string;
  jobs?: Record<string, IWorkflowJob>;
}

const RELEASE_JOB = 'release';
const TEST_JOB = 'test';
const DEVELOP_CONDITION = "github.ref == 'refs/heads/develop'";
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const FULL_COMMIT = /@[0-9a-f]{40}$/;
const TOKEN_REFERENCE = 'secrets.NPM_ACCESS_TOKEN';

/** The steps allowed to read the registry token: they publish, or move a dist-tag. */
export const TOKEN_STEP_NAMES: ReadonlySet<string> = new Set([
  'Publish to NPM',
  'Tag highest version on NPM',
  'Keep next at or above latest',
]);

const stepsOf = (job: IWorkflowJob | undefined): IWorkflowStep[] => job?.steps ?? [];

const needsOf = (job: IWorkflowJob | undefined): string[] => {
  const needs = job?.needs;
  if (needs === undefined) {
    return [];
  }

  return Array.isArray(needs) ? needs : [needs];
};

/** Every guard that does not hold in `text`, empty when the workflow is as hardened as the release requires. */
export const checkReleaseWorkflow = (opts: { text: string }): IReleaseWorkflowViolation[] => {
  const { text } = opts;
  const violations: IReleaseWorkflowViolation[] = [];
  const violate = (guard: string, message: string): void => {
    violations.push({ guard, message });
  };

  const workflow = Bun.YAML.parse(text) as IWorkflow;
  const release = workflow.jobs?.[RELEASE_JOB];
  const test = workflow.jobs?.[TEST_JOB];

  if (release?.if?.replaceAll(/\s+/g, ' ').trim() !== DEVELOP_CONDITION) {
    violate(
      ReleaseWorkflowGuards.DEVELOP_ONLY,
      `the '${RELEASE_JOB}' job must carry \`if: ${DEVELOP_CONDITION}\``,
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

  const releasePermissions = release?.permissions;
  const testPermissions = test?.permissions;
  const testWrites =
    typeof testPermissions === 'object' &&
    Object.values(testPermissions).some((level) => level === 'write');
  if (
    typeof releasePermissions !== 'object' ||
    releasePermissions?.contents !== 'write' ||
    testWrites
  ) {
    violate(
      ReleaseWorkflowGuards.WRITE_ON_RELEASE_ONLY,
      `only the '${RELEASE_JOB}' job may write, and it must state \`contents: write\``,
    );
  }

  if (!needsOf(release).includes(TEST_JOB)) {
    violate(
      ReleaseWorkflowGuards.TEST_JOB_NEEDED,
      `the '${RELEASE_JOB}' job must \`needs: ${TEST_JOB}\``,
    );
  }

  const testText = JSON.stringify(test ?? {});
  if (
    !test ||
    testText.includes('secrets.') ||
    test.environment !== undefined ||
    testWrites ||
    typeof testPermissions !== 'object'
  ) {
    violate(
      ReleaseWorkflowGuards.TEST_JOB_HOLDS_NO_SECRET,
      `the '${TEST_JOB}' job must exist, state read-only permissions, name no environment and reference no secret`,
    );
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

  const bunSteps = Object.values(workflow.jobs ?? {})
    .flatMap(stepsOf)
    .filter((step) => step.uses?.startsWith('oven-sh/setup-bun@'));
  if (
    bunSteps.length === 0 ||
    bunSteps.some((step) => !EXACT_VERSION.test(String(step.with?.['bun-version'] ?? '')))
  ) {
    violate(
      ReleaseWorkflowGuards.BUN_EXACT,
      'every setup-bun step must state an exact `bun-version` (x.y.z), never `latest`',
    );
  }

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of stepsOf(job)) {
      if (
        JSON.stringify(step).includes(TOKEN_REFERENCE) &&
        !TOKEN_STEP_NAMES.has(step.name ?? '')
      ) {
        violate(
          ReleaseWorkflowGuards.TOKEN_STEPS_ONLY,
          `the registry token is read in '${step.name}' (${jobName}); only ${[...TOKEN_STEP_NAMES].join(', ')} may read it`,
        );
      }
    }
  }

  const checkouts = Object.values(workflow.jobs ?? {})
    .flatMap(stepsOf)
    .filter((step) => step.uses?.startsWith('actions/checkout@'));
  if (
    checkouts.length === 0 ||
    checkouts.some((step) => String(step.with?.ref ?? '').trim() !== '${{ github.sha }}')
  ) {
    violate(
      ReleaseWorkflowGuards.CHECKOUT_AT_DISPATCHED_COMMIT,
      'every checkout must use `ref: ${{ github.sha }}`, never a branch name',
    );
  }

  const syncsBranch = Object.values(workflow.jobs ?? {})
    .flatMap(stepsOf)
    .some((step) =>
      /git checkout develop|git pull origin develop|git pull --ff-only/.test(step.run ?? ''),
    );
  if (syncsBranch) {
    violate(
      ReleaseWorkflowGuards.NO_BRANCH_SYNC,
      'no step may move to the tip of a branch (`git checkout develop`, `git pull origin develop`): the release works on the dispatched commit',
    );
  }

  if (!String(workflow['run-name'] ?? '').includes('github.sha')) {
    violate(
      ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      'the `run-name` must carry the dispatched commit (`github.sha`)',
    );
  }

  const unpinned = Object.values(workflow.jobs ?? {})
    .flatMap(stepsOf)
    .filter((step) => step.uses !== undefined && !FULL_COMMIT.test(step.uses));
  if (unpinned.length > 0) {
    violate(
      ReleaseWorkflowGuards.ACTIONS_PINNED_BY_COMMIT,
      `every action must be pinned by a full commit: ${unpinned.map((step) => step.uses).join(', ')}`,
    );
  }

  const unitTests = stepsOf(test).some((step) => /make test-\$PACKAGE/.test(step.run ?? ''));
  if (!unitTests) {
    violate(
      ReleaseWorkflowGuards.UNIT_TESTS_RUN,
      `the '${TEST_JOB}' job must run the package's unit tests (\`make test-$PACKAGE\`)`,
    );
  }

  return violations;
};
