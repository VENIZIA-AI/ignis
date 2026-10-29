import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkReleaseWorkflow, ReleaseWorkflowGuards } from '../release-workflow';

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
    checkReleaseWorkflow({
      text: opts.text ?? WORKFLOW,
      runnerText: opts.runnerText ?? RUNNER,
    }).map((violation) => violation.guard),
  ),
];

describe('the release workflow keeps its guards', () => {
  test('the workflow and the loop as committed have no violation', () => {
    expect(checkReleaseWorkflow({ text: WORKFLOW, runnerText: RUNNER })).toEqual([]);
  });

  test('the guard list and the mutations below cover each other', () => {
    expect(ReleaseWorkflowGuards.SCHEME_SET.size).toBe(27);
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
      guard: ReleaseWorkflowGuards.DEVELOP_ONLY,
      edits: [{ find: "    if: github.ref == 'refs/heads/develop'\n", replace: '' }],
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
      edits: [{ find: '    needs: [plan, test, scripts]\n', replace: '    needs: [plan, test]\n' }],
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
          find: '          RELEASE_ISSUE: ${{ inputs.issue }}\n',
          replace:
            '          RELEASE_ISSUE: ${{ inputs.issue }}\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
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
      edits: [{ find: ' | commit: ${{ github.sha }}', replace: '' }],
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
      checkReleaseWorkflow({
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
      checkReleaseWorkflow({ text: leaked, runnerText: RUNNER })
        .filter((violation) => violation.guard === ReleaseWorkflowGuards.NO_NPM_TOKEN)
        .map((violation) => violation.message),
    ).toEqual([expect.stringContaining(`the workflow, line ${line}`)]);
  });
});
