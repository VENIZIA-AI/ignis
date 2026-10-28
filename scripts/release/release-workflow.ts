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
  static readonly NO_NPM_TOKEN = 'no-npm-token';
  static readonly ENVIRONMENT_ON_RELEASE = 'environment-on-release';
  static readonly OIDC_ON_RELEASE_ONLY = 'oidc-on-release-only';
  static readonly NODE_EXACT_NO_CACHE = 'node-exact-no-cache';
  static readonly NPM_EXACT_AND_ASSERTED = 'npm-exact-and-asserted';
  static readonly PUBLISH_TARBALL_WITH_PROVENANCE = 'publish-tarball-with-provenance';
  static readonly TARBALL_SHA256_CHECKED = 'tarball-sha256-checked';
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
    this.NO_NPM_TOKEN,
    this.ENVIRONMENT_ON_RELEASE,
    this.OIDC_ON_RELEASE_ONLY,
    this.NODE_EXACT_NO_CACHE,
    this.NPM_EXACT_AND_ASSERTED,
    this.PUBLISH_TARBALL_WITH_PROVENANCE,
    this.TARBALL_SHA256_CHECKED,
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
const RELEASE_ENVIRONMENT = 'npm-release';
const NPM_TOKEN_NAMES = ['NPM_ACCESS_TOKEN', 'NPM_CONFIG_TOKEN', 'NODE_AUTH_TOKEN'];
const SECRET_REFERENCE = 'secrets.';
const EXACT_NPM = /npm install (?:--global|-g) npm@(\d+\.\d+\.\d+)(?:\s|$)/;
/** The first npm that moves a dist-tag over OIDC; publishing needs 11.5.1. */
const MINIMUM_NPM = '11.21.0';
const INSTALL_NPM_STEP = 'Install the npm that publishes';
const PACK_STEP = 'Pack and checksum the release tarball';
const PUBLISH_STEP = 'Publish to NPM';
const TARBALL_PATH = '"$TARBALLS/$PACKAGE.tgz"';

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

  const hasOidc = (permissions: unknown): boolean =>
    typeof permissions === 'object' && permissions !== null && 'id-token' in permissions;
  if (
    typeof releasePermissions !== 'object' ||
    releasePermissions?.['id-token'] !== 'write' ||
    hasOidc(defaults) ||
    hasOidc(testPermissions)
  ) {
    violate(
      ReleaseWorkflowGuards.OIDC_ON_RELEASE_ONLY,
      `only the '${RELEASE_JOB}' job may hold \`id-token\`, and it must state \`id-token: write\`: that is what the trusted publisher signs in with`,
    );
  }

  if (release?.environment !== RELEASE_ENVIRONMENT) {
    violate(
      ReleaseWorkflowGuards.ENVIRONMENT_ON_RELEASE,
      `the '${RELEASE_JOB}' job must name \`environment: ${RELEASE_ENVIRONMENT}\`: its reviewers and ref rule are what a run waits on, and the trusted publisher names it`,
    );
  }

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of stepsOf(job)) {
      const stepText = JSON.stringify(step);
      const leaked = [SECRET_REFERENCE, ...NPM_TOKEN_NAMES].find((name) => stepText.includes(name));
      if (leaked !== undefined) {
        violate(
          ReleaseWorkflowGuards.NO_NPM_TOKEN,
          `'${step.name}' (${jobName}) names \`${leaked}\`; the release holds no secret and no npm token, it publishes through trusted publishing`,
        );
      }
    }
  }

  const nodeSteps = Object.values(workflow.jobs ?? {})
    .flatMap(stepsOf)
    .filter((step) => step.uses?.startsWith('actions/setup-node@'));
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

  const releaseSteps = stepsOf(release);
  const stepNamed = (name: string): IWorkflowStep | undefined =>
    releaseSteps.find((step) => step.name === name);
  const install = stepNamed(INSTALL_NPM_STEP);
  const pack = stepNamed(PACK_STEP);
  const publishCommand = stepNamed(PUBLISH_STEP)?.run ?? '';

  const installedNpm = EXACT_NPM.exec(install?.run ?? '')?.[1];
  if (
    installedNpm === undefined ||
    Bun.semver.order(installedNpm, MINIMUM_NPM) < 0 ||
    !(install?.run ?? '').includes('npm --version')
  ) {
    violate(
      ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      `'${INSTALL_NPM_STEP}' must install an exact npm of at least ${MINIMUM_NPM} and assert it with \`npm --version\``,
    );
  }

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of stepsOf(job).filter((entry) => entry.run?.includes('bun publish'))) {
      violate(
        ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
        `'${step.name}' (${jobName}) runs \`bun publish\`; bun has no trusted publishing, npm publishes a tarball bun packed`,
      );
    }
  }

  if (
    !publishCommand.includes('npm publish') ||
    !publishCommand.includes('--provenance') ||
    !publishCommand.includes(TARBALL_PATH)
  ) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      `'${PUBLISH_STEP}' must run \`npm publish --provenance\` on \`${TARBALL_PATH}\``,
    );
  }

  if (!(pack?.run ?? '').includes('bun pm pack')) {
    violate(
      ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      `'${PACK_STEP}' must pack with \`bun pm pack\`: only bun resolves \`catalog:\` and \`workspace:\`, npm ships them verbatim`,
    );
  }

  if (!(pack?.run ?? '').includes('sha256sum') || !publishCommand.includes('sha256sum --check')) {
    violate(
      ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      `'${PACK_STEP}' must record the sha256 of the tarball and '${PUBLISH_STEP}' must check it: what is published is what was packed`,
    );
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
