import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkReleaseWorkflow, ReleaseWorkflowGuards, TOKEN_STEP_NAMES } from '../release-workflow';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/package-release.yml'), 'utf8');

/**
 * The workflow with one piece of text swapped. The anchor must hit exactly once, or every time when
 * `everywhere` is set (one guard in two jobs); a swap that hits nothing proves nothing.
 */
const mutate = (opts: { find: string; replace: string; everywhere?: boolean }): string => {
  const hits = WORKFLOW.split(opts.find).length - 1;
  if (hits === 0 || (hits > 1 && !opts.everywhere)) {
    throw new Error(`mutation anchor occurs ${hits} times: ${opts.find.slice(0, 60)}`);
  }

  return WORKFLOW.replaceAll(opts.find, () => opts.replace);
};

const guardsOf = (text: string): string[] => [
  ...new Set(checkReleaseWorkflow({ text }).map((violation) => violation.guard)),
];

describe('the release workflow keeps its guards', () => {
  test('the workflow as committed has no violation', () => {
    expect(checkReleaseWorkflow({ text: WORKFLOW })).toEqual([]);
  });

  test('the guard list and the mutations below cover each other', () => {
    expect(ReleaseWorkflowGuards.SCHEME_SET.size).toBe(13);
  });
});

describe('one mutation per guard: removing the guard from a copy fails the check', () => {
  const MUTATIONS: Array<{ guard: string; find: string; replace: string; everywhere?: boolean }> = [
    {
      guard: ReleaseWorkflowGuards.DEVELOP_ONLY,
      find: "    if: github.ref == 'refs/heads/develop'\n",
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.READ_ONLY_DEFAULT,
      find: '\npermissions:\n  contents: read\n',
      replace: '\n',
    },
    {
      guard: ReleaseWorkflowGuards.WRITE_ON_RELEASE_ONLY,
      find: '    permissions:\n      contents: write\n',
      replace: '    permissions:\n      contents: read\n',
    },
    {
      guard: ReleaseWorkflowGuards.TEST_JOB_NEEDED,
      find: '    needs: test\n',
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.TEST_JOB_HOLDS_NO_SECRET,
      find: '      - name: Lint\n        run: make lint-$PACKAGE\n',
      replace:
        '      - name: Lint\n        run: make lint-$PACKAGE\n        env:\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    },
    {
      guard: ReleaseWorkflowGuards.VULCAN_PINNED,
      find: 'VULCAN_CMD="bun x @venizia/vulcan@$(jq -r \'.devDependencies["@venizia/vulcan"]\' package.json)"',
      replace: 'VULCAN_CMD="bun x @venizia/vulcan@latest"',
    },
    {
      guard: ReleaseWorkflowGuards.BUN_EXACT,
      find: "bun-version: '1.4.4'",
      replace: 'bun-version: latest',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.TOKEN_STEPS_ONLY,
      find: '      - name: Version bump\n',
      replace:
        '      - name: Version bump\n        env:\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    },
    {
      guard: ReleaseWorkflowGuards.CHECKOUT_AT_DISPATCHED_COMMIT,
      find: 'ref: ${{ github.sha }}',
      replace: 'ref: develop',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NO_BRANCH_SYNC,
      find: '      - name: Version bump\n',
      replace:
        '      - name: Sync develop\n        run: git fetch origin && git checkout develop && git pull origin develop\n\n      - name: Version bump\n',
    },
    {
      guard: ReleaseWorkflowGuards.RUN_NAME_CARRIES_COMMIT,
      find: ' | commit: ${{ github.sha }}',
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.ACTIONS_PINNED_BY_COMMIT,
      find: 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0',
      replace: 'actions/setup-node@v6.4.0',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.UNIT_TESTS_RUN,
      find: 'make test-$PACKAGE',
      replace: 'echo skipped',
      everywhere: true,
    },
  ];

  test('the table names every guard once', () => {
    expect(MUTATIONS.map((mutation) => mutation.guard).sort()).toEqual(
      [...ReleaseWorkflowGuards.SCHEME_SET].sort(),
    );
  });

  for (const mutation of MUTATIONS) {
    test(`${mutation.guard}: removed, the check names it`, () => {
      const guards = guardsOf(mutate(mutation));

      expect(guards).toContain(mutation.guard);
    });
  }
});

describe('the registry token', () => {
  test('is read only in the steps that publish or move a dist-tag', () => {
    expect([...TOKEN_STEP_NAMES].sort()).toEqual([
      'Keep next at or above latest',
      'Publish to NPM',
      'Tag highest version on NPM',
    ]);
  });
});
