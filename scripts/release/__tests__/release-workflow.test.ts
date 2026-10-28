import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkReleaseWorkflow, ReleaseWorkflowGuards } from '../release-workflow';

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

/** Several swaps applied in order to one copy: a guard about ORDER needs a piece removed and put back elsewhere. */
const mutateMany = (edits: Array<{ find: string; replace: string }>): string =>
  edits.reduce((current, edit) => {
    const hits = current.split(edit.find).length - 1;
    if (hits !== 1) {
      throw new Error(`mutation anchor occurs ${hits} times: ${edit.find.slice(0, 60)}`);
    }

    return current.replace(edit.find, () => edit.replace);
  }, WORKFLOW);

const guardsOf = (text: string): string[] => [
  ...new Set(checkReleaseWorkflow({ text }).map((violation) => violation.guard)),
];

describe('the release workflow keeps its guards', () => {
  test('the workflow as committed has no violation', () => {
    expect(checkReleaseWorkflow({ text: WORKFLOW })).toEqual([]);
  });

  test('the guard list and the mutations below cover each other', () => {
    expect(ReleaseWorkflowGuards.SCHEME_SET.size).toBe(21);
  });
});

describe('one mutation per guard: removing the guard from a copy fails the check', () => {
  const MUTATIONS: Array<
    | { guard: string; find: string; replace: string; everywhere?: boolean }
    | { guard: string; edits: Array<{ find: string; replace: string }> }
  > = [
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
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      find: '      - name: Version bump\n',
      replace:
        '      - name: Version bump\n        env:\n          LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      find: '      - name: Keep next at or above latest\n',
      replace:
        '      - name: Keep next at or above latest\n        env:\n          NODE_AUTH_TOKEN: x\n',
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      find: '          echo "IS_PUBLISHED=true" >> $GITHUB_ENV\n',
      replace:
        '          echo "IS_PUBLISHED=true" >> $GITHUB_ENV\n          export NPM_CONFIG_TOKEN=x\n',
    },
    {
      guard: ReleaseWorkflowGuards.ENVIRONMENT_ON_RELEASE,
      find: '    environment: npm-release\n',
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_RELEASE_ONLY,
      find: '      id-token: write\n',
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_RELEASE_ONLY,
      find: '    name: Test\n    runs-on: ubuntu-26.04\n    permissions:\n      contents: read\n',
      replace:
        '    name: Test\n    runs-on: ubuntu-26.04\n    permissions:\n      contents: read\n      id-token: write\n',
    },
    {
      guard: ReleaseWorkflowGuards.OIDC_ON_RELEASE_ONLY,
      find: '\npermissions:\n  contents: read\n',
      replace: '\npermissions:\n  contents: read\n  id-token: write\n',
    },
    {
      guard: ReleaseWorkflowGuards.NODE_EXACT_NO_CACHE,
      find: 'node-version: 24.22.1',
      replace: "node-version: '24'",
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NODE_EXACT_NO_CACHE,
      find: 'package-manager-cache: false',
      replace: 'package-manager-cache: true',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      find: '11.21.1',
      replace: 'latest',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      find: '11.21.1',
      replace: '11.19.1',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      find: 'npm --version',
      replace: 'true',
      everywhere: true,
    },
    {
      guard: ReleaseWorkflowGuards.NPM_EXACT_AND_ASSERTED,
      find: '- name: Install the npm that publishes',
      replace: '- name: Install an npm',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      find: '--provenance',
      replace: '',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      find: 'npm publish "',
      replace: 'echo "',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      find: '"$TARBALLS/$PACKAGE.tgz" --access public',
      replace: '. --access public',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      find: 'bun pm pack --quiet --filename',
      replace: 'npm pack --quiet --filename',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      find: '      - name: Tag highest version on NPM\n',
      replace:
        '      - name: Publish again\n        run: bun publish --access public\n\n      - name: Tag highest version on NPM\n',
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      find: 'sha256sum --check',
      replace: 'true',
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      find: 'sha256sum *.tgz > SHA256SUMS',
      replace: 'true',
    },
    {
      guard: ReleaseWorkflowGuards.NO_NPM_TOKEN,
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    },
    {
      guard: ReleaseWorkflowGuards.SCRIPT_TESTS_RUN,
      find: 'make test-scripts',
      replace: 'echo skipped',
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_VERSION_CHECKED,
      find: '[ "$PACKED_VERSION" = "$NEW_VERSION" ]',
      replace: 'true',
    },
    {
      guard: ReleaseWorkflowGuards.PUBLISH_TARBALL_WITH_PROVENANCE,
      edits: [
        { find: '--ignore-scripts --provenance', replace: '--ignore-scripts' },
        {
          find: "          # Trusted publishing: no token; npm signs in with this job's identity and writes the provenance.\n",
          replace: '          # npm publish "$TARBALLS/$PACKAGE.tgz" --provenance\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      edits: [
        {
          find: '(cd "$TARBALLS" && sha256sum --check --quiet SHA256SUMS)',
          replace: '# sha256sum --check',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      edits: [
        {
          find: '          (cd "$TARBALLS" && sha256sum --check --quiet SHA256SUMS)\n',
          replace: '',
        },
        {
          find: '          echo "+ $PACKAGE_NAME@$NEW_VERSION"\n',
          replace:
            '          (cd "$TARBALLS" && sha256sum --check --quiet SHA256SUMS)\n          echo "+ $PACKAGE_NAME@$NEW_VERSION"\n',
        },
      ],
    },
    {
      guard: ReleaseWorkflowGuards.TARBALL_SHA256_CHECKED,
      edits: [
        {
          find: '          (cd "$TARBALLS" && sha256sum --check --quiet SHA256SUMS)\n',
          replace: '',
        },
        {
          find: '          echo "IS_PUBLISHED=true" >> $GITHUB_ENV\n',
          replace:
            '          echo "IS_PUBLISHED=true" >> $GITHUB_ENV\n          (cd "$TARBALLS" && sha256sum --check --quiet SHA256SUMS)\n',
        },
      ],
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

  test('the table names every guard', () => {
    expect([...new Set(MUTATIONS.map((mutation) => mutation.guard))].sort()).toEqual(
      [...ReleaseWorkflowGuards.SCHEME_SET].sort(),
    );
  });

  for (const mutation of MUTATIONS) {
    test(`${mutation.guard}: removed, the check names it`, () => {
      const guards = guardsOf('edits' in mutation ? mutateMany(mutation.edits) : mutate(mutation));

      expect(guards).toContain(mutation.guard);
    });
  }
});

describe('the release holds no registry token', () => {
  const withoutComments = (text: string): string => text.replace(/(^|[ \t])#.*$/gm, '');

  test('the committed workflow, comments aside, reads no secret and names no npm token', () => {
    expect(withoutComments(WORKFLOW)).not.toMatch(
      /secrets\.|NPM_ACCESS_TOKEN|NPM_CONFIG_TOKEN|NODE_AUTH_TOKEN/,
    );
  });

  test('a comment that names the token is not a token', () => {
    const commented = mutate({
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  # secrets.NPM_ACCESS_TOKEN is gone\n',
    });

    expect(checkReleaseWorkflow({ text: commented })).toEqual([]);
  });

  test('the violation names the line it read', () => {
    const leaked = mutate({
      find: '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n',
      replace:
        '  BUILD_MODE: ${{ github.event.inputs.build_mode }}\n  LEAK: ${{ secrets.NPM_ACCESS_TOKEN }}\n',
    });
    const line = leaked.split('\n').findIndex((entry) => entry.includes('LEAK:')) + 1;

    expect(
      checkReleaseWorkflow({ text: leaked })
        .filter((violation) => violation.guard === ReleaseWorkflowGuards.NO_NPM_TOKEN)
        .map((violation) => violation.message),
    ).toEqual([expect.stringContaining(`line ${line}`)]);
  });
});
