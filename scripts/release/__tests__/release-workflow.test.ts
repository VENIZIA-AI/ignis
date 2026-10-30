import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReleaseWorkflowCheck, ReleaseWorkflowGuards } from '../release-workflow';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/package-release.yml'), 'utf8');
const RUNNER = readFileSync(resolve(ROOT, 'scripts/release/release-run.ts'), 'utf8');

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

const guardsOf = (opts: { text?: string; runnerText?: string }): string[] => [
  ...new Set(
    ReleaseWorkflowCheck.check({
      text: opts.text ?? WORKFLOW,
      runnerText: opts.runnerText ?? RUNNER,
    }).map((violation) => violation.guard),
  ),
];

describe('the release workflow keeps its guards', () => {
  test('the workflow and the loop as committed have no violation', () => {
    expect(ReleaseWorkflowCheck.check({ text: WORKFLOW, runnerText: RUNNER })).toEqual([]);
  });

  test('the guard list and the mutations below cover each other', () => {
    expect(ReleaseWorkflowGuards.SCHEME_SET.size).toBe(35);
  });
});

describe('one mutation per guard: removing the guard from a copy fails the check', () => {
  const MUTATIONS: Array<{
    guard: string;
    /** Edits to the workflow. */
    edits?: IEdit[];
    /** Edits to scripts/release/release-run.ts. */
    runner?: IEdit[];
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

      expect(guardsOf({ text, runnerText })).toContain(mutation.guard);
    });
  }
});

describe('the release holds no registry token', () => {
  const withoutComments = (text: string): string => text.replace(/(^|[ \t])#.*$/gm, '');
  const withoutScriptComments = (text: string): string => text.replace(/(^|[ \t])\/\/.*$/gm, '');
  const TOKEN = /secrets\.|NPM_ACCESS_TOKEN|NPM_CONFIG_TOKEN|NODE_AUTH_TOKEN/;

  test('the committed workflow and loop, comments aside, read no secret and name no npm token', () => {
    expect(withoutComments(WORKFLOW)).not.toMatch(TOKEN);
    expect(withoutScriptComments(RUNNER)).not.toMatch(TOKEN);
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
      }),
    ).toEqual([]);
  });

  test('the violation names the file and the line it read', () => {
    const leaked = mutate({
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    });
    const line = leaked.split('\n').findIndex((entry) => entry.includes('LEAK:')) + 1;

    expect(
      ReleaseWorkflowCheck.check({ text: leaked, runnerText: RUNNER })
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
