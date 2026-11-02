import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ReleaseWorkflowCheck, ReleaseWorkflowGuards } from '../release-workflow';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/package-release.yml'), 'utf8');
const RUNNER = readFileSync(resolve(ROOT, 'scripts/release/release-run.ts'), 'utf8');
const RELEASE_SCRIPT = readFileSync(resolve(ROOT, 'scripts/release/github-release.ts'), 'utf8');

interface IEdit {
  find: string;
  replace: string;
  everywhere?: boolean;
}

/**
 * `source` with one piece of text swapped. The anchor must hit exactly once, or every time when `everywhere`
 * is set (one guard in two jobs); a swap that hits nothing proves nothing.
 */
const swap = (source: string, edit: IEdit): string => {
  const hits = source.split(edit.find).length - 1;
  if (hits === 0 || (hits > 1 && !edit.everywhere)) {
    throw new Error(`mutation anchor occurs ${hits} times: ${edit.find.slice(0, 60)}`);
  }

  return source.replaceAll(edit.find, () => edit.replace);
};

const mutate = (edit: IEdit): string => swap(WORKFLOW, edit);

/** Several swaps applied in order to one copy. */
const mutateMany = (edits: IEdit[]): string =>
  edits.reduce((current, edit) => swap(current, edit), WORKFLOW);

const guardsOf = (opts: {
  text?: string;
  runnerText?: string;
  releaseScriptText?: string;
}): string[] => [
  ...new Set(
    ReleaseWorkflowCheck.check({
      text: opts.text ?? WORKFLOW,
      runnerText: opts.runnerText ?? RUNNER,
      releaseScriptText: opts.releaseScriptText ?? RELEASE_SCRIPT,
    }).map((violation) => violation.guard),
  ),
];

/** The step "Create the GitHub Release" as the workflow has it, to move it in a copy. */
const GITHUB_RELEASE_STEP_TEXT = ((): string => {
  const start = WORKFLOW.indexOf('      - name: Create the GitHub Release\n');
  const end = WORKFLOW.indexOf('\n\n', start);

  return WORKFLOW.slice(start, end + 2);
})();

const MOVE_GITHUB_RELEASE_STEP: IEdit[] = [{ find: GITHUB_RELEASE_STEP_TEXT, replace: '' }];

describe('the release workflow keeps its guards', () => {
  test('the workflow and the loop as committed have no violation', () => {
    expect(
      ReleaseWorkflowCheck.check({
        text: WORKFLOW,
        runnerText: RUNNER,
        releaseScriptText: RELEASE_SCRIPT,
      }),
    ).toEqual([]);
  });

  test('the guard list and the mutations below cover each other', () => {
    expect(ReleaseWorkflowGuards.SCHEME_SET.size).toBe(39);
  });
});

describe('one mutation per guard: removing the guard from a copy fails the check', () => {
  const MUTATIONS: Array<{
    guard: string;
    /** Edits to the workflow. */
    edits?: IEdit[];
    /** Edits to scripts/release/release-run.ts. */
    runner?: IEdit[];
    /** Edits to scripts/release/github-release.ts. */
    script?: IEdit[];
  }> = [
    {
      guard: ReleaseWorkflowGuards.REF_BY_KIND,
      edits: [
        {
          find: '${{ !cancelled() && needs.plan.result',
          replace: "${{ github.ref == 'refs/heads/develop' && !cancelled() && needs.plan.result",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.REF_BY_KIND,
      edits: [{ find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.REF_BY_KIND,
      edits: [{ find: 'run: bun scripts/release/release-run.ts plan', replace: 'run: echo plan' }],
    },
    {
      guard: ReleaseWorkflowGuards.READ_ONLY_DEFAULT,
      edits: [{ find: '\npermissions:\n  contents: read\n', replace: '\n' }],
    },
    {
      guard: ReleaseWorkflowGuards.WRITE_ON_PUBLISH_ONLY,
      edits: [
        {
          find: '    permissions:\n      contents: write\n      id-token: write\n',
          replace: '    permissions:\n      contents: read\n      id-token: write\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.WRITE_ON_PUBLISH_ONLY,
      edits: [
        {
          find: '    permissions:\n      contents: read\n    outputs:',
          replace: '    permissions:\n      contents: write\n    outputs:',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GATES_NEEDED,
      edits: [
        {
          find: '    needs: [plan, test, scripts, approve]\n',
          replace: '    needs: [plan, test, approve]\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GATE_JOBS_HOLD_NO_SECRET,
      edits: [
        {
          find: '      - name: Lint\n        run: make lint-$PACKAGE\n',
          replace:
            '      - name: Lint\n        run: make lint-$PACKAGE\n        env:\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GATE_JOBS_HOLD_NO_SECRET,
      edits: [
        {
          find: '    name: Test the repository scripts\n    needs: plan\n',
          replace:
            '    name: Test the repository scripts\n    needs: plan\n    environment: npm-release\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.VULCAN_PINNED,
      edits: [
        {
          find: 'VULCAN_CMD="bun x @venizia/vulcan@$(jq -r \'.devDependencies["@venizia/vulcan"]\' package.json)"',
          replace: 'VULCAN_CMD="bun x @venizia/vulcan@latest"',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.BUN_EXACT,
      edits: [{ find: "bun-version: '1.4.4'", replace: 'bun-version: latest', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      edits: [
        {
          find: '          RELEASE_ISSUE: ${{ inputs.issue }}\n        run: bun scripts/release/release-run.ts run',
          replace:
            '          RELEASE_ISSUE: ${{ inputs.issue }}\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n        run: bun scripts/release/release-run.ts run',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      edits: [
        {
          find: '      - name: Setup Git\n',
          replace: '      - name: Setup Git\n        env:\n          NODE_AUTH_TOKEN: x\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      edits: [
        {
          find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
          replace:
            '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      runner: [
        {
          find: '  const [command, manifestPath] = Bun.argv.slice(2);\n',
          replace:
            "  const [command, manifestPath] = Bun.argv.slice(2);\n  process.env.NPM_CONFIG_TOKEN = 'x';\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ENVIRONMENT_ON_PUBLISH,
      edits: [{ find: '    environment: npm-release\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_PUBLISH_ONLY,
      edits: [{ find: '      id-token: write\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_PUBLISH_ONLY,
      edits: [
        {
          find: '    name: Test the repository scripts\n    needs: plan\n    runs-on: ubuntu-26.04\n    permissions:\n      contents: read\n',
          replace:
            '    name: Test the repository scripts\n    needs: plan\n    runs-on: ubuntu-26.04\n    permissions:\n      contents: read\n      id-token: write\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_PUBLISH_ONLY,
      edits: [
        {
          find: '\npermissions:\n  contents: read\n',
          replace: '\npermissions:\n  contents: read\n  id-token: write\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NODE_EXACT_NO_CACHE,
      edits: [{ find: 'node-version: 24.22.1', replace: "node-version: '24'", everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NODE_EXACT_NO_CACHE,
      edits: [
        {
          find: 'package-manager-cache: false',
          replace: 'package-manager-cache: true',
          everywhere: true,
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      edits: [{ find: '11.21.1', replace: 'latest', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      edits: [{ find: '11.21.1', replace: '11.19.1', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      edits: [{ find: 'npm --version', replace: 'true', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      edits: [
        { find: '- name: Install the npm that publishes', replace: '- name: Install an npm' },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      runner: [{ find: "          '--provenance',\n", replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      runner: [
        {
          find: "          'npm',\n          'publish',",
          replace: "          'bun',\n          'publish',",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      runner: [{ find: "command: ['bun', 'pm', 'pack',", replace: "command: ['npm', 'pack'," }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      edits: [
        {
          find: '      - name: Release the plan\n',
          replace:
            '      - name: Publish again\n        run: bun publish --access public\n\n      - name: Release the plan\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.CHECKOUT_AT_DISPATCHED_COMMIT,
      edits: [{ find: 'ref: ${{ github.sha }}', replace: 'ref: develop', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.NO_BRANCH_SYNC,
      edits: [
        {
          find: '      - name: Setup Git\n',
          replace:
            '      - name: Sync develop\n        run: git fetch origin && git checkout develop && git pull origin develop\n\n      - name: Setup Git\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_BRANCH_SYNC,
      runner: [
        {
          find: "await ports.run({ command: ['git', 'push', 'origin', `HEAD:${branch}`] });",
          replace:
            "await ports.run({ command: ['git', 'pull', '--rebase', 'origin', branch] });\n      await ports.run({ command: ['git', 'push', 'origin', `HEAD:${branch}`] });",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      edits: [{ find: ', github.sha) }}"', replace: ", 'unknown') }}\"" }],
    },
    {
      guard: ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      edits: [{ find: 'inputs.label || format(', replace: 'format(' }],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [{ find: '          RELEASE_LABEL: ${{ inputs.label }}\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '          RELEASE_LABEL: ${{ inputs.label }}\n',
          replace: '          RELEASE_LABEL: a fixed title\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '          RELEASE_ISSUE: ${{ inputs.issue }}\n          RELEASE_LABEL: ${{ inputs.label }}\n',
          replace: '          RELEASE_LABEL: ${{ inputs.label }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      runner: [{ find: 'ReleaseTargets.labelProblems({', replace: 'ReleaseTargets.noProblems({' }],
    },
    {
      // A check whose finding does not stop the job.
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      runner: [{ find: 'if (labelProblems.length > 0) {', replace: 'if (false) {' }],
    },
    {
      // An issue that is not checked.
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      runner: [{ find: 'if (!/^\\d*$/.test(issue)) {', replace: 'if (false) {' }],
    },
    {
      // The label read through another spelling of the inputs.
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '      PACKAGE: ${{ matrix.package }}\n',
          replace: "      PACKAGE: ${{ matrix.package }}\n      TITLE: ${{ inputs['label'] }}\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '      PACKAGE: ${{ matrix.package }}\n',
          replace: '      PACKAGE: ${{ matrix.package }}\n      ALL: ${{ toJSON(inputs) }}\n',
        },
      ],
    },
    {
      // A third reader of the label.
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '      PACKAGE: ${{ matrix.package }}\n',
          replace: '      PACKAGE: ${{ matrix.package }}\n      TITLE: ${{ inputs.label }}\n',
        },
      ],
    },
    {
      // A plan job that may fail and go on.
      guard: ReleaseWorkflowGuards.PLAN_CHECKS_THE_LABEL,
      edits: [
        {
          find: '        id: plan\n        env:\n          PLAN: ${{ inputs.plan }}\n',
          replace:
            '        id: plan\n        continue-on-error: true\n        env:\n          PLAN: ${{ inputs.plan }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ACTIONS_PINNED_BY_COMMIT,
      edits: [
        {
          find: 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0',
          replace: 'actions/setup-node@v6.4.0',
          everywhere: true,
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.UNIT_TESTS_RUN,
      edits: [{ find: 'make test-$PACKAGE', replace: 'echo skipped', everywhere: true }],
    },
    {
      guard: ReleaseWorkflowGuards.SCRIPT_TESTS_RUN,
      edits: [{ find: 'make test-scripts', replace: 'echo skipped' }],
    },
    {
      guard: ReleaseWorkflowGuards.ONE_PLAN_INPUT,
      edits: [
        {
          find: '      plan:\n        type: string\n',
          replace:
            '      package:\n        type: string\n        required: false\n      plan:\n        type: string\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.DEFAULT_MODE_PRERELEASE,
      edits: [{ find: "        default: 'prerelease'\n", replace: "        default: 'patch'\n" }],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_JOB_FIRST,
      edits: [
        {
          find: '    name: Test the repository scripts\n    needs: plan\n',
          replace: '    name: Test the repository scripts\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_JOB_FIRST,
      edits: [
        {
          find: '    name: Plan\n    runs-on: ubuntu-26.04\n',
          replace: '    name: Plan\n    runs-on: ubuntu-26.04\n    environment: npm-release\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.MATRIX_OVER_PLAN,
      edits: [
        {
          find: '      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}\n',
          replace: '      matrix:\n        package: [kernel]\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.BUILD_ONCE,
      edits: [{ find: 'run: make core-server core-worker boot', replace: 'run: make $PACKAGE' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      edits: [
        { find: 'run: bun scripts/release/release-run.ts run', replace: 'run: echo skipped' },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      edits: [
        { find: 'PLAN: ${{ needs.plan.outputs.plan }}', replace: 'PLAN: ${{ inputs.plan }}' },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_INTERPOLATION_IN_RUN,
      edits: [
        {
          find: '          git config user.name "venizia-ci"\n',
          replace:
            '          git config user.name "venizia-ci"\n          echo ${{ inputs.issue }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TIMEOUT,
      edits: [{ find: 'timeout-minutes: 240', replace: 'timeout-minutes: 30' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TIMEOUT,
      edits: [{ find: 'timeout-minutes: 240\n', replace: '' }],
    },
    // The approval.
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        {
          find: "    if: ${{ needs.plan.outputs.kind == 'stable' }}\n    runs-on: ubuntu-26.04\n    environment: release-approval\n",
          replace: '    runs-on: ubuntu-26.04\n    environment: release-approval\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        {
          find: '    name: Approve ${{ needs.plan.outputs.headline }}\n    needs: [plan, test, scripts]\n',
          replace:
            '    name: Approve ${{ needs.plan.outputs.headline }}\n    needs: [plan, test]\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        {
          find: '    name: Approve ${{ needs.plan.outputs.headline }}\n',
          replace: '    name: Approve the release\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        {
          find: '    environment: release-approval\n    permissions: {}\n',
          replace: '    environment: release-approval\n    permissions:\n      contents: read\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        {
          find: '          HEADLINE: ${{ needs.plan.outputs.headline }}\n',
          replace:
            '          HEADLINE: ${{ needs.plan.outputs.headline }}\n      - name: More\n        run: echo more\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.APPROVE_FOR_STABLE_ONLY,
      edits: [
        { find: '    environment: npm-release\n', replace: '    environment: release-approval\n' },
      ],
    },
    // The publish condition, evaluated over its cases.
    {
      guard: ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      edits: [{ find: "      && needs.scripts.result == 'success'\n", replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      edits: [
        {
          find: "      || (needs.approve.result == 'skipped' && needs.plan.outputs.kind == 'prerelease')) }}",
          replace: "      || needs.approve.result == 'skipped') }}",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      edits: [{ find: '${{ !cancelled() && needs.plan.result', replace: '${{ needs.plan.result' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      edits: [{ find: " && needs.test.result == 'success'", replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_AFTER_APPROVE,
      edits: [
        {
          find: "      && (needs.approve.result == 'success'\n",
          replace: "      && (needs.approve.result != 'failure'\n",
        },
      ],
    },
    // A stable is refused when a branch moved.
    {
      guard: ReleaseWorkflowGuards.STABLE_REFUSES_MOVED_BRANCHES,
      edits: [
        {
          find: "      - name: Refuse a stable when a branch moved since the plan\n        if: ${{ needs.plan.outputs.kind == 'stable' }}\n",
          replace: '      - name: Refuse a stable when a branch moved since the plan\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.STABLE_REFUSES_MOVED_BRANCHES,
      edits: [
        {
          find: 'if [ "$(git rev-parse origin/develop)" != "$PLAN_DEVELOP_SHA" ]; then',
          replace: 'if false; then',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.STABLE_REFUSES_MOVED_BRANCHES,
      edits: [
        {
          find: 'if [ "$(git rev-parse origin/main)" != "$GITHUB_SHA" ]; then',
          replace: 'if false; then',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.STABLE_REFUSES_MOVED_BRANCHES,
      edits: [
        {
          find: '      - name: Setup Git\n',
          replace:
            '      - name: Install early\n        run: bun install\n\n      - name: Setup Git\n',
        },
      ],
    },
    // The merge trial in the plan job.
    {
      guard: ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      edits: [
        {
          find: '        run: bun scripts/release/merge-back.ts trial --versions "$TARGETS" --lock keep',
          replace: '        run: echo skipped',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      edits: [
        {
          find: '--versions "$TARGETS" --lock keep',
          replace: '--versions "$TARGETS" --lock regenerate',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      edits: [
        {
          find: '      develop_sha: ${{ steps.trial.outputs.develop_sha }}\n',
          replace: '      develop_sha: ${{ steps.plan.outputs.develop_sha }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      edits: [
        {
          find: "          fetch-depth: 0\n          persist-credentials: false\n\n      # Exact, so a new bun cannot change what a release does. Raising it is a pull request of its own.\n      - name: Setup Bun\n        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0\n        with:\n          bun-version: '1.4.4'\n\n      - name: Plan the release",
          replace:
            "          fetch-depth: 1\n          persist-credentials: false\n\n      # Exact, so a new bun cannot change what a release does. Raising it is a pull request of its own.\n      - name: Setup Bun\n        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0\n        with:\n          bun-version: '1.4.4'\n\n      - name: Plan the release",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PLAN_TRIES_THE_MERGE_BACK,
      edits: [
        {
          find: "        id: trial\n        if: ${{ steps.plan.outputs.kind == 'stable' }}\n",
          replace: '        id: trial\n',
        },
      ],
    },
    // The merge back.
    {
      guard: ReleaseWorkflowGuards.MERGE_BACK_FROM_A_COPY,
      edits: [
        {
          find: '          cp scripts/release/merge-back.ts "$RUNNER_TEMP/merge-back.ts"\n',
          replace: '',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.MERGE_BACK_FROM_A_COPY,
      edits: [
        {
          find: 'bun "$RUNNER_TEMP/merge-back.ts" apply --repo "$RUNNER_TEMP/develop-merge"',
          replace: 'bun scripts/release/merge-back.ts apply --repo "$RUNNER_TEMP/develop-merge"',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.MERGE_BACK_FROM_A_COPY,
      edits: [
        {
          find: '          git worktree add --detach "$RUNNER_TEMP/develop-merge" origin/develop\n',
          replace: '          git switch develop\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.MERGE_BACK_FROM_A_COPY,
      edits: [
        {
          find: "      - name: Merge main back into develop\n        if: ${{ needs.plan.outputs.kind == 'stable' }}\n",
          replace: '      - name: Merge main back into develop\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.TARGET_BRANCH_BY_KIND,
      edits: [
        {
          find: '          TARGET_BRANCH: ${{ needs.plan.outputs.branch }}\n',
          replace: '          TARGET_BRANCH: develop\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.TARGET_BRANCH_BY_KIND,
      edits: [{ find: '          TARGET_BRANCH: ${{ needs.plan.outputs.branch }}\n', replace: '' }],
    },
    // Nothing is forced, moved or deleted.
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      edits: [
        {
          find: '          git -C "$RUNNER_TEMP/develop-merge" push origin HEAD:develop\n',
          replace:
            '          git -C "$RUNNER_TEMP/develop-merge" push --force origin HEAD:develop\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      edits: [
        {
          find: '          git fetch --quiet origin develop\n\n          if git merge-base',
          replace:
            '          git tag -f stable HEAD\n          git fetch --quiet origin develop\n\n          if git merge-base',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      runner: [
        {
          find: "['git', 'push', 'origin', tag]",
          replace: "['git', 'push', '--force', 'origin', tag]",
          everywhere: true,
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      runner: [
        {
          find: "['git', 'tag', '-a', tag, '-m', `${packageName} v${onDisk}`, sha.trim()]",
          replace: "['git', 'tag', '-f', tag, sha.trim()]",
        },
      ],
    },
    // The GitHub Release of the run.
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '      - name: Create the GitHub Release\n',
          replace: '      - name: Create nothing\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [{ find: '        continue-on-error: true\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [{ find: '        timeout-minutes: 5\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [{ find: '          GH_TOKEN: ${{ github.token }}\n', replace: '' }],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '          GH_TOKEN: ${{ github.token }}\n',
          replace:
            '          GH_TOKEN: ${{ github.token }}\n          LEAK: ${{ secrets.RELEASE_PAT }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: 'github-release.ts create --targets "$TARGETS" --kind',
          replace: 'github-release.ts create --kind',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: 'github-release.ts create --targets "$TARGETS" --kind "$RELEASE_KIND"',
          replace: 'github-release.ts create --targets "$TARGETS"',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '          TARGETS: ${{ needs.plan.outputs.targets }}\n        run: bun scripts/release/github-release.ts',
          replace:
            '          TARGETS: kernel=1.0.0\n        run: bun scripts/release/github-release.ts',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        ...MOVE_GITHUB_RELEASE_STEP,
        {
          find: '      - name: Release the plan\n',
          replace: `${GITHUB_RELEASE_STEP_TEXT}      - name: Release the plan\n`,
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        ...MOVE_GITHUB_RELEASE_STEP,
        {
          find: '      - name: Report - published, merge back not done\n',
          replace: `${GITHUB_RELEASE_STEP_TEXT}      - name: Report - published, merge back not done\n`,
        },
      ],
    },
    // The step is pinned: one command, no key that changes what runs or when, three variables, a short timeout.
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '--kind "$RELEASE_KIND"\n',
          replace: '--kind "$RELEASE_KIND" && gh release edit atlas-index --notes injected\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '        run: bun scripts/release/github-release.ts create --targets "$TARGETS" --kind "$RELEASE_KIND"\n',
          replace:
            '        run: |\n          bun scripts/release/github-release.ts create --targets "$TARGETS" --kind "$RELEASE_KIND"\n          gh release delete atlas-index --yes\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '--kind "$RELEASE_KIND"\n',
          replace:
            '--kind "$RELEASE_KIND" || bun scripts/release/github-release.ts backfill --tag core-server-v0.4.6 --yes\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '        continue-on-error: true\n',
          replace: '        if: false\n        continue-on-error: true\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '        continue-on-error: true\n',
          replace: '        if: always()\n        continue-on-error: true\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        { find: '        timeout-minutes: 5\n', replace: '        timeout-minutes: 100000\n' },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [{ find: '        timeout-minutes: 5\n', replace: '        timeout-minutes: 0\n' }],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '          TARGETS: ${{ needs.plan.outputs.targets }}\n        run: bun scripts/release/github-release.ts',
          replace:
            '          TARGETS: ${{ needs.plan.outputs.targets }}\n          GH_REPO: attacker/elsewhere\n        run: bun scripts/release/github-release.ts',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '        timeout-minutes: 5\n',
          replace: '        timeout-minutes: 5\n        shell: bash\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '        timeout-minutes: 5\n',
          replace: '        timeout-minutes: 5\n        working-directory: packages\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: '          RELEASE_KIND: ${{ needs.plan.outputs.kind }}\n',
          replace: '          RELEASE_KIND: stable\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_NEVER_FAILS_A_PUBLISH,
      edits: [
        {
          find: 'bun scripts/release/github-release.ts create',
          replace: 'bun scripts/release/other-script.ts create',
        },
      ],
    },
    // A step name is found by its text, so a second step of the same name is the one that runs unchecked.
    {
      guard: ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      edits: [
        {
          find: GITHUB_RELEASE_STEP_TEXT,
          replace: `${GITHUB_RELEASE_STEP_TEXT}${GITHUB_RELEASE_STEP_TEXT}`,
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      edits: [
        {
          find: '      - name: Report - published, merge back not done\n',
          replace:
            '      - name: Merge main back into develop\n        run: echo again\n\n      - name: Report - published, merge back not done\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_RUNS_THE_LOOP,
      edits: [
        {
          find: '      - name: Report - published, merge back not done\n',
          replace:
            '      - name: Release the plan\n        run: echo again\n\n      - name: Report - published, merge back not done\n',
        },
      ],
    },
    // github-release.ts views and creates; it reads no token and forces nothing.
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "args: ['release', 'view', tag, '--json', 'tagName']",
          replace: "args: ['release', 'delete', tag, '--yes']",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "      if (opts.gh({ args: ['release', 'view', tag, '--json', 'tagName'] }).status === 0) {",
          replace:
            "      opts.gh({ args: ['release', 'edit', 'atlas-index', '--notes', 'x'] });\n      if (opts.gh({ args: ['release', 'view', tag, '--json', 'tagName'] }).status === 0) {",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "      const child = Bun.spawnSync(['gh', ...args], {",
          replace:
            "      Bun.spawnSync(['gh', 'release', 'upload', 'atlas-index', 'x']);\n      const child = Bun.spawnSync(['gh', ...args], {",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "          'release',\n          'create',\n",
          replace: "          'release',\n          'comment',\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      script: [{ find: "args: ['tag', '--list']", replace: "args: ['tag', '--list', '--force']" }],
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      script: [
        {
          find: "  static readonly TITLE_PREFIX = 'IGNIS';",
          replace:
            "  static readonly LEAK = 'secrets.TOKEN';\n  static readonly TITLE_PREFIX = 'IGNIS';",
        },
      ],
    },
    // The rule on `gh` is enforced when ghOf runs; the text guard pins the code that keeps it so.
    ...[
      ['arguments from a variable', '{ args: viewArguments }'],
      ['the shorthand { args }', '{ args }'],
      ['a spread', "{ args: [...['release', 'delete', tag]] }"],
      ['a split string', "{ args: 'release delete x'.split(' ') }"],
      ['a template literal', "{ args: [`release`, 'delete', tag] }"],
    ].map(([, call]) => ({
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "      if (opts.gh({ args: ['release', 'view', tag, '--json', 'tagName'] }).status === 0) {",
          replace: `      opts.gh(${call});\n      if (opts.gh({ args: ['release', 'view', tag, '--json', 'tagName'] }).status === 0) {`,
        },
      ],
    })),
    ...[
      ['a second spawn written with a space', "Bun.spawnSync (['rm', 'x']);"],
      ['the Bun shell', 'const shell = Bun.$;'],
      [
        'fetch with DELETE',
        "void fetch('https://api.github.com/repos/x/y/releases/1', { method: 'DELETE' });",
      ],
    ].map(([, line]) => ({
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "      const child = Bun.spawnSync(['gh', ...args], {",
          replace: `      ${line}\n      const child = Bun.spawnSync(['gh', ...args], {`,
        },
      ],
    })),
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "import { tmpdir } from 'node:os';",
          replace:
            "import { execFileSync } from 'node:child_process';\nimport { tmpdir } from 'node:os';",
        },
      ],
    },
    ...['GH_TOKEN', 'GITHUB_TOKEN'].map((name) => ({
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [
        {
          find: "  static readonly TITLE_PREFIX = 'IGNIS';",
          replace: `  static readonly TOKEN = process.env.${name};\n  static readonly TITLE_PREFIX = 'IGNIS';`,
        },
      ],
    })),
    {
      guard: ReleaseWorkflowGuards.GITHUB_RELEASE_ONLY_VIEWS_AND_CREATES,
      script: [{ find: 'GithubRelease.refusalOf({ args })', replace: 'undefined' }],
    },
    {
      guard: ReleaseWorkflowGuards.NO_FORCE_OR_TAG_MOVE,
      script: [
        { find: "args: ['tag', '--list']", replace: "args: ['tag', '--list', '+refs/tags/x']" },
      ],
    },
    // The environment the publish steps run in is the one the file shows.
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '    environment: npm-release\n',
          replace: '    environment: npm-release\n    defaults:\n      run:\n        shell: bash\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '    environment: npm-release\n',
          replace: '    environment: npm-release\n    env:\n      GH_REPO: attacker/elsewhere\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n',
          replace: '  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n  GH_REPO: attacker/elsewhere\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '\nconcurrency:\n',
          replace: '\ndefaults:\n  run:\n    shell: bash\n\nconcurrency:\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '          git config user.email "developer@venizia.ai"\n',
          replace:
            '          git config user.email "developer@venizia.ai"\n          echo "GH_REPO=attacker/elsewhere" >> "$GITHUB_ENV"\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_ENVIRONMENT_IS_CLOSED,
      edits: [
        {
          find: '          git config user.email "developer@venizia.ai"\n',
          replace:
            '          git config user.email "developer@venizia.ai"\n          echo "/tmp/bin" >> "$GITHUB_PATH"\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    permissions:\n      contents: write\n    # Each run uploads',
          replace:
            '    permissions:\n      contents: write\n      id-token: write\n    # Each run uploads',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    permissions:\n      contents: write\n    # Each run uploads',
          replace:
            '    permissions:\n      contents: write\n      packages: write\n    # Each run uploads',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    runs-on: ubuntu-26.04\n    continue-on-error: true\n',
          replace:
            '    runs-on: ubuntu-26.04\n    environment: npm-release\n    continue-on-error: true\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    runs-on: ubuntu-26.04\n    continue-on-error: true\n',
          replace: '    runs-on: ubuntu-26.04\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    needs: [plan, publish]\n    # A tag is pushed',
          replace: '    needs: [plan]\n    # A tag is pushed',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "(needs.publish.result == 'success' || needs.publish.result == 'failure') }}\n    runs-on",
          replace: "needs.publish.result != 'cancelled' }}\n    runs-on",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '      max-parallel: 1\n',
          replace: '      max-parallel: 4\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        run: bun install\n",
          replace:
            "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        env:\n          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n        run: bun install\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '          ref: ${{ steps.tag.outputs.tag }}\n        env:',
          replace:
            '          ref: ${{ steps.tag.outputs.tag }}\n          key-env: ATLAS_INDEX_KEY\n        env:',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "        if: ${{ steps.tag.outputs.tag != '' }}\n",
          replace: '',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "# The tags the publish job pushed are fetched with the whole history; the commit to build is the tag's, not this one.\n      - name: Checkout\n        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 0\n          persist-credentials: false\n",
          replace:
            "# The tags the publish job pushed are fetched with the whole history; the commit to build is the tag's, not this one.\n      - name: Checkout\n        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 0\n          persist-credentials: true\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
          replace:
            '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  OTHER: ${{ secrets.ATLAS_INDEX_KEY }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '      fail-fast: false\n      max-parallel: 1\n',
          replace: '      fail-fast: true\n      max-parallel: 1\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '        package: ${{ fromJSON(needs.plan.outputs.matrix).package }}\n',
          replace: '        package: ${{ fromJSON(needs.plan.outputs.matrix).other }}\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "# The tags the publish job pushed are fetched with the whole history; the commit to build is the tag's, not this one.\n      - name: Checkout\n        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 0\n",
          replace:
            "# The tags the publish job pushed are fetched with the whole history; the commit to build is the tag's, not this one.\n      - name: Checkout\n        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 1\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '          IFS=\',\' read -ra PAIRS <<< "$TARGETS"\n',
          replace:
            '          IFS=\',\' read -ra PAIRS <<< "$TARGETS"\n          echo "${{ github.sha }}" > /dev/null\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '          IFS=\',\' read -ra PAIRS <<< "$TARGETS"\n',
          replace:
            '          IFS=\',\' read -ra PAIRS <<< "$TARGETS"\n          echo "NODE_OPTIONS=--require=x" >> "$GITHUB_ENV"\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n',
          replace:
            '          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n          EXTRA: value\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n',
          replace:
            '          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n\n      - name: After the key\n        run: echo done\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        run: bun install\n",
          replace:
            "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        env:\n          K: ${{ secrets['ATLAS_INDEX_KEY'] }}\n        run: bun install\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        run: bun install\n",
          replace:
            "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        env:\n          K: ${{ toJSON(secrets) }}\n        run: bun install\n",
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: "      # The action runs the project's installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        run: bun install\n",
          replace:
            '      # The action runs the project\'s installed atlas (`vulcan x atlas index publish`).\n      - name: Install\n        run: bun install && echo "PATH=/x" >> "$GITHUB_PATH"\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    permissions:\n      contents: write\n    # Each run uploads',
          replace:
            '    env:\n      X: value\n    permissions:\n      contents: write\n    # Each run uploads',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '    permissions:\n      contents: write\n    # Each run uploads',
          replace:
            '    container: ubuntu:latest\n    permissions:\n      contents: write\n    # Each run uploads',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.ATLAS_INDEX_JOB_CONFINED,
      edits: [
        {
          find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
          replace:
            '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  OTHER: ${{ SECRETS.ATLAS_INDEX_KEY }}\n',
        },
      ],
    },
  ];

  test('the table names every guard', () => {
    expect([...new Set(MUTATIONS.map((mutation) => mutation.guard))].sort()).toEqual(
      [...ReleaseWorkflowGuards.SCHEME_SET].sort(),
    );
  });

  for (const [index, mutation] of MUTATIONS.entries()) {
    test(`${mutation.guard} (${index + 1}): removed, the check names it`, () => {
      const text = mutation.edits ? mutateMany(mutation.edits) : WORKFLOW;
      const runnerText = (mutation.runner ?? []).reduce(
        (current, edit) => swap(current, edit),
        RUNNER,
      );
      const releaseScriptText = (mutation.script ?? []).reduce(
        (current, edit) => swap(current, edit),
        RELEASE_SCRIPT,
      );

      expect(guardsOf({ text, runnerText, releaseScriptText })).toContain(mutation.guard);
    });
  }
});

describe('the release holds no registry token', () => {
  const withoutComments = (text: string): string => text.replace(/(^|[ \t])#.*$/gm, '');
  const withoutScriptComments = (text: string): string => text.replace(/(^|[ \t])\/\/.*$/gm, '');
  const TOKEN = /secrets\.|NPM_ACCESS_TOKEN|NPM_CONFIG_TOKEN|NODE_AUTH_TOKEN/;

  test('the committed workflow and loop, comments aside, read no secret and name no npm token', () => {
    // The one exception is the atlas job's key line, which `atlas-index-job-confined` confines.
    const KEY_LINE = '          ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}\n';
    expect(withoutComments(WORKFLOW).replace(KEY_LINE, '')).not.toMatch(TOKEN);
    expect(withoutScriptComments(RUNNER)).not.toMatch(TOKEN);
    expect(withoutScriptComments(RELEASE_SCRIPT)).not.toMatch(TOKEN);
  });

  test('a comment that names the token is not a token, in the workflow or in the loop', () => {
    const commented = mutate({
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  # secrets.NPM_ACCESS_TOKEN is gone\n',
    });

    expect(
      ReleaseWorkflowCheck.check({
        text: commented,
        runnerText: `// NPM_CONFIG_TOKEN is gone\n${RUNNER}`,
        releaseScriptText: `// secrets.GITHUB_TOKEN is not read\n${RELEASE_SCRIPT}`,
      }),
    ).toEqual([]);
  });

  test('a token named in github-release.ts is noticed, with the file and the line', () => {
    const violations = ReleaseWorkflowCheck.check({
      text: WORKFLOW,
      runnerText: RUNNER,
      releaseScriptText: `${RELEASE_SCRIPT}\nconst leak = process.env.NODE_AUTH_TOKEN;\n`,
    }).filter((violation) => violation.guard === ReleaseWorkflowGuards.NO_NPM_TOKEN);

    expect(violations.map((violation) => violation.message)).toEqual([
      expect.stringContaining('github-release.ts, line'),
    ]);
  });

  test('the violation names the file and the line it read', () => {
    const leaked = mutate({
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    });
    const line = leaked.split('\n').findIndex((entry) => entry.includes('LEAK:')) + 1;

    expect(
      ReleaseWorkflowCheck.check({
        text: leaked,
        runnerText: RUNNER,
        releaseScriptText: RELEASE_SCRIPT,
      })
        .filter((violation) => violation.guard === ReleaseWorkflowGuards.NO_NPM_TOKEN)
        .map((violation) => violation.message),
    ).toEqual([expect.stringContaining(`the workflow, line ${line}`)]);
  });
});

describe('the run name is one expression over the label and the commit', () => {
  const RUN_NAME = /^run-name: .*$/m.exec(WORKFLOW)?.[0] ?? '';

  test('the committed run name is found', () => {
    expect(RUN_NAME).toContain('inputs.label');
  });

  test('a name that only mentions the label and the commit as text is noticed', () => {
    for (const runName of [
      'Release · ${{ inputs.build_mode }} · literal inputs.label github.sha',
      '${{ inputs.label }} github.sha',
      'Release · ${{ inputs.build_mode }} · ${{ github.sha }}',
    ]) {
      expect(
        guardsOf({ text: mutate({ find: RUN_NAME, replace: `run-name: "${runName}"` }) }),
        runName,
      ).toContain(ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT);
    }
  });
});

describe('release-run.ts plan, run as the plan job runs it', () => {
  const SHA = 'c84852a7e1d0b6a2f3c9d8e7b6a5f4e3d2c1b0a9';
  const plan = (env: Record<string, string>) =>
    Bun.spawnSync(['bun', resolve(ROOT, 'scripts/release/release-run.ts'), 'plan'], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH ?? '',
        PLAN: 'helpers@0.4.6',
        BUILD_MODE: 'prerelease',
        GITHUB_REF: 'refs/heads/develop',
        GITHUB_SHA: SHA,
        ...env,
      },
    });
  const LABEL = 'prerelease · 0.4.7-0 helpers · #664 · c84852a';

  test('accepts the label it computes, and no label', () => {
    expect(plan({ RELEASE_ISSUE: '664', RELEASE_LABEL: LABEL }).exitCode).toBe(0);
    expect(plan({ RELEASE_ISSUE: '664', RELEASE_LABEL: '' }).exitCode).toBe(0);
  });

  test('refuses another label, and says so quoted', () => {
    const result = plan({
      RELEASE_ISSUE: '664',
      RELEASE_LABEL: 'prerelease · 0.4.7-0 kernel · #664 · c84852a',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('the run title is refused');
  });

  test('refuses an issue that is not a number, before it reaches the title or a commit', () => {
    const result = plan({ RELEASE_ISSUE: '664\n::set-output name=x::y', RELEASE_LABEL: '' });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('the issue must be a number or empty');
  });
});

describe('the atlas pair of each release tag', () => {
  const parsed = Bun.YAML.parse(WORKFLOW) as {
    jobs: Record<
      string,
      {
        steps?: Array<{
          id?: string;
          name?: string;
          run?: string;
          uses?: string;
          with?: Record<string, unknown>;
        }>;
      }
    >;
  };
  const steps = parsed.jobs['atlas-index']?.steps ?? [];
  const nameTheTag = steps.find((step) => step.id === 'tag')?.run ?? '';
  const publishStep = steps.find((step) => step.uses?.includes('actions/atlas-index@'));

  const runTagStep = (opts: { tags: string[]; targets: string; released: string }) => {
    const repository = mkdtempSync(join(tmpdir(), 'ignis-atlas-tag-'));
    try {
      const output = join(repository, 'github-output');
      const git = (args: string[]) =>
        Bun.spawnSync({ cmd: ['git', ...args], cwd: repository, stdout: 'pipe', stderr: 'pipe' });
      git(['init', '-q']);
      git([
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      ]);
      for (const tag of opts.tags) {
        git(['tag', tag]);
      }

      const result = Bun.spawnSync({
        cmd: ['bash', '-e', '-c', nameTheTag],
        cwd: repository,
        env: {
          PATH: process.env.PATH ?? '',
          GITHUB_OUTPUT: output,
          RELEASED_PACKAGE: opts.released,
          TARGETS: opts.targets,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      return {
        exitCode: result.exitCode,
        written: existsSync(output) ? readFileSync(output, 'utf8').trim() : '',
      };
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  };

  test('a package of the plan gets the tag release-run.ts makes for it, when that tag exists', () => {
    expect(RUNNER).toContain('`${dir}-v${version}`');

    const run = runTagStep({
      tags: ['boot-v0.4.7-5', 'core-server-v0.4.7-5'],
      targets: 'dev-configs=0.4.7-5,boot=0.4.7-5,core-server=0.4.7-5',
      released: 'boot',
    });

    expect(run).toEqual({ exitCode: 0, written: 'tag=boot-v0.4.7-5' });
  });

  test('a package whose tag is not there (a publish that stopped before it) gets no pair and does not fail', () => {
    const run = runTagStep({
      tags: ['boot-v0.4.7-5'],
      targets: 'boot=0.4.7-5,core-server=0.4.7-5',
      released: 'core-server',
    });

    expect(run).toEqual({ exitCode: 0, written: 'tag=' });
  });

  test('a package that is not in the plan targets is an error', () => {
    const run = runTagStep({ tags: [], targets: 'boot=0.4.7-5', released: 'helpers' });

    expect(run.exitCode).not.toBe(0);
  });

  test('the action step runs only when a tag was found, with that tag as its only input', () => {
    expect(publishStep?.with).toEqual({ ref: '${{ steps.tag.outputs.tag }}' });
  });

  test('the action is pinned at the commit deploy-docs.yml pins, and passes inputs the action declares', () => {
    const deployDocs = readFileSync(resolve(ROOT, '.github/workflows/deploy-docs.yml'), 'utf8');
    const pin = (text: string) =>
      /uses: (VENIZIA-AI\/vulcan\/\.github\/actions\/atlas-index@[0-9a-f]{40}) # (\S+)/
        .exec(text)
        ?.slice(1, 3);
    // Recorded from action.yml at that commit (read by hand): it declares exactly `key-env` and `ref`; the release job
    // passes `ref` only. A bump of the pin is a deliberate pull request that re-reads it.
    const declared = ['key-env', 'ref'];

    expect(pin(WORKFLOW)).toBeDefined();
    expect(pin(WORKFLOW)).toEqual(pin(deployDocs));
    expect(Object.keys(publishStep?.with ?? {}).every((name) => declared.includes(name))).toBe(
      true,
    );
  });

  test('the installed atlas accepts the flags the action passes, offline, and uploads nothing', () => {
    const publish = (env: Record<string, string>) =>
      Bun.spawnSync({
        cmd: [
          'bun',
          'x',
          '--no-install',
          'vulcan',
          'x',
          'atlas',
          'index',
          'publish',
          '--key-env',
          'ATLAS_INDEX_KEY',
          '--ref',
          'boot-v0.0.0',
        ],
        cwd: ROOT,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          GITHUB_REPOSITORY: 'VENIZIA-AI/ignis',
          GITHUB_TOKEN: 'x',
          ...env,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      }).stdout.toString();

    // A manual run with no key publishes nothing; a push refuses a ref. Both prove the flag is read.
    expect(publish({ GITHUB_EVENT_NAME: 'workflow_dispatch', ATLAS_INDEX_KEY: '' })).toContain(
      'ATLAS_INDEX_KEY is empty',
    );
    expect(publish({ GITHUB_EVENT_NAME: 'push', ATLAS_INDEX_KEY: 'k' })).toContain(
      'a ref can only be given to a manual run',
    );
  });
});
