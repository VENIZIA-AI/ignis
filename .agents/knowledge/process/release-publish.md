---
type: Playbook
title: Release and publish
description: How to run the manually-triggered NPM release workflow for an IGNIS package.
resource: .github/workflows/package-release.yml
tags: [process, release, ci]
---

<!-- okf:generated:contents start -->
**Contents**

- [Before a chain release](#before-a-chain-release)
- [What atlas reads after a release](#what-atlas-reads-after-a-release)
- [The VULCAN preset](#the-vulcan-preset)
- [The two jobs and their guards](#the-two-jobs-and-their-guards)
- [The prebuilt atlas index of this repository](#the-prebuilt-atlas-index-of-this-repository)
- [Steps](#steps)
- [Related](#related)
<!-- okf:generated:contents end -->

## Before a chain release

- Pass `--issue <N>` - the release issue - so the commits a release makes (the workflow's
  `chore(<package>): release v...`) lead with `[#N]` like every other commit. The workflow takes
  it as its optional `issue` input.
- Release from `develop` through `bun scripts/release/release.ts` (`--dry-run` first): it dispatches this
  workflow one package at a time in dependency order (dev-configs, inversion, filter, helpers, boot,
  kernel, connectors, core-worker, core-server), waits for each run, and reads the registry back
  before the next dispatch - a range that goes stale mid-flight fails the run. The script refuses an
  unpushed or non-`develop` checkout because the workflow releases the commit it was dispatched on, and it waits
  for a run that needs an approval with no time limit, saying so once (`scripts/release/release-watch.ts`). After the last package it waits until the tarball of every released version answers 200
  (`scripts/release/release-tarballs.ts`, up to fifteen minutes each, in parallel), because the registry lists a version minutes before its file is downloadable; the release is reported done only then.
- A sweep without package names releases each package with source changes AND every package that depends on
  one, transitively (the plan says why): the published manifests pin internal dependencies exactly, so a
  package left behind keeps the old version and a consumer installs two copies. Naming packages releases
  the first one and everything after it in the chain. Always read the `--dry-run` plan first.
- Measure the downstream consumer before dispatching, not after: copy the consumer repository to a
  temp directory without `node_modules`, recreate its `node_modules` as symlinks to the original
  entries with every `@venizia/*` entry pointed at the freshly built `packages/<name>` (dependency
  versions pinned to the consumer's own resolved copies, or two `zod`/`hono` trees land in one
  program), run `tsc --noEmit` per consumer package, and diff against the same run with the
  pinned versions. Every new error must map to a documented breaking change; the rest is the
  finding. The public-surface snapshot tracks names and kinds only, so this is the check for
  signatures.

## What atlas reads after a release

Nothing is regenerated or committed after a chain. VULCAN's atlas computes the releases from the
git tags the workflow pushes, and reads symbols from the built or installed `.d.ts`. `make
atlas-releases` and `make atlas-symbols` print what it sees (both come from
`node_modules/@venizia/vulcan/base/make/vulcan.mk`). Only the public-surface snapshot
(`reference/public-surface.md`, `make surface-gen`) is committed, and `make build-all` gates it.
- **Package names on the command line.** `release.ts <pkg>` means "from this package on". Before
  #172 the first name was dropped unless `--chain-released` was passed (`args[seedIndex + 1]` with
  `seedIndex = -1`); the parsing now lives in `scripts/release/release-args.ts` with its own test.

## The VULCAN preset

`@venizia/ignis` ships a data-only VULCAN preset (`vulcan.presets.app` and `vulcan.presets.lib` in its `package.json`), so `vulcan init --preset ignis` creates a working monorepo. It has two kinds: `presets/app` (`vulcan add --preset ignis --app <name>`, derived from `examples/5-mins-qs`) and `presets/lib` (`--lib <name>`, a shared library: `exports` to `src`, `@venizia/ignis` as a peer, no `server:dev` or `compile`). Each is `preset.json` with `workspace:*` / `catalog:` markers plus `files/`; the lib also gets the app's `.configs/` and its lint and clean scripts at build time. `scripts/preset/vulcan-preset.ts` (`make preset-build`) resolves the markers to the exact workspace versions and the root-catalog ranges and writes `dist/presets/app` and `dist/presets/lib`, named by `vulcan.presets.app` and `vulcan.presets.lib`; the release workflow runs it after "Sync develop", so the preset names the release it ships in. `make preset-smoke` (`scripts/preset/preset-smoke.ts`) packs the workspace, creates an app from the packed preset in a temp folder and runs its typecheck, lint and test, then `vulcan doctor` and `okf check`, and calls `GET /api/hello`; it gates the `core-server` release before the bump, and CI runs it after the build. `bun pm pack` drops every `__tests__` folder, so the preset keeps its smoke test at `src/smoke.test.ts`.

## The two jobs and their guards

The workflow has two jobs. `test` holds no secret and has read-only permissions: it builds, runs the checks
below and the package's unit tests (`make test-$PACKAGE`), and runs the preset smoke against the VULCAN
version the repository declares in `devDependencies` (never `latest`). `release` `needs: test`, runs only
from `develop` (`if: github.ref == 'refs/heads/develop'`), is the only job with `contents: write`, and is the
only one that reads the registry token, in the publish and the dist-tag steps. Both check out
`${{ github.sha }}`, the dispatched commit, never a branch name, and the run name carries it. Bun is an
exact version and every action is pinned by a full commit with its tag in a comment.

`scripts/release/release-workflow.ts` reads the workflow and names every guard that is missing;
`scripts/release/__tests__/release-workflow.test.ts` removes each guard from a copy, one at a time, and
expects the check to name it (listed in `scripts/checks/controls.json`). Change a guard on purpose, and its
mutation in that test, in the same pull request.

## The prebuilt atlas index of this repository

IGNIS publishes the atlas index of its own commits, so a project that declares IGNIS as a source downloads it instead of building it. `.github/workflows/atlas-index.yml` runs on a push to `main`, to `develop` or of a tag, builds the index through VULCAN's action (`VENIZIA-AI/vulcan/.github/actions/atlas-index`, pinned by full commit to the installed VULCAN release; a bump is a deliberate pull request), signs it with the Actions secret `ATLAS_INDEX_KEY` and attaches the pair to the release `atlas-index`. The public half of the key is `atlas.index.keys` in `.configs/vulcan.config.mts`, rendered into `.agents/vulcan.manifest.json`; a reader accepts a pair only when a listed key verifies it, and otherwise builds locally as before. The job has `contents: write` and nothing else does; the secret is read only by the publishing step; `scripts/release/__tests__/atlas-index-workflow.test.ts` holds those rules.

**Release tags get no pair from it.** The release workflow pushes its release commits and tags with the Actions token, and GitHub starts no workflow from a push made with that token, so a release tag of IGNIS gets no pair from `atlas-index.yml`; the next push to `develop` covers the head. VULCAN 0.4.7 runs the action from its own release; IGNIS gets that when it moves to it. The release keeps the newest 20 branch-head pairs and every release-tag commit's pair, 300 pairs at most. A new key is made with `bun x --no-install vulcan x atlas index keygen` by the maintainer, who sets the secret; an agent never writes it.

## Steps

1. This is a `workflow_dispatch` workflow ("NPM Release") - it never runs on push, tag, or PR. A
   human triggers it from the GitHub Actions tab (or `gh workflow run`) and picks two required
   inputs:
   - `package`: one of `dev-configs`, `inversion`, `filter`, `helpers`, `boot`, `kernel`,
     `connectors`, `core-server`, `core-worker`.
   - `build_mode`: the semver bump - `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`,
     or `prerelease` (default `patch`).
   A repository-wide `concurrency: npm-release` group serialises runs. A second dispatch waits; a
   third one cancels the waiting one, because the chain has to be released in order anyway.
2. The job resolves `PACKAGE_PATH` as `packages/<name>` for the chosen package and reads its
   current `package.json` name and version. `docs/wiki` (`@venizia/ignis-docs`) has no entry in
   this list - it lost its release path when the `docs-mcp` input retired with the MCP server it
   built, and is not currently republished through this workflow.
3. `bun run --filter "@venizia/*" force-update "highest"` runs BEFORE `bun install`, and over the
   WHOLE workspace rather than the one package being released.
   - It skips a sibling of this repository: manifests name siblings `workspace:*`, which `bun publish` writes as the sibling's exact version in the tarball (a caret let a fresh install pair one release with the next release's sibling), while development keeps linking the workspace copy. An exact version in the manifest would stop linking the moment the sibling bumps.
   - Before the install, because `force-update` rewrites the internal version ranges and an install
     that ran first has already resolved the old ones. When a sibling has moved past a declared
     range, that range no longer covers the workspace copy, so bun downloads the published tarball
     and the build type-checks against a package one release behind.
   - Over the whole workspace, because `bun install` resolves every member: one stale range anywhere
     fails the run, even in a package the release does not touch. Releasing a package makes every
     dependent's floor stale the instant it lands, and that window is minutes wide during a release
     chain. Only the released package's manifest is committed afterwards; the rest are repaired in
     the runner, and repaired again on the next run.

   Internal dependencies stay literal `^x.y.z` ranges rather than bun's `workspace:` protocol. The
   protocol fixes the install side - it always links the workspace copy - but it resolves the
   PUBLISHED floor from the version recorded in `bun.lock`, and bun 1.3.14 never refreshes that
   record on a version bump (measured against `bun install`, `--force` and `--lockfile-only`). A
   package would then publish a floor one release behind, silently. Loud beats silent here.
4. `bun install`, then an assertion that every `@venizia/*` dependency resolves to the workspace and
   not to a registry tarball. Each one is a member of this workspace, so a tarball is always wrong -
   and otherwise invisible, because the install succeeds and the lie only surfaces as
   unrelated-looking type errors.
5. Build, lint and purity go through the SAME Makefile targets you'd use locally: `make $PACKAGE`,
   `make lint-$PACKAGE`, `make purity-test`, then `make purity-$PACKAGE`. The purity probe's own
   regression tests run first, so a probe that silently stopped detecting anything cannot leave the
   gate green for the wrong reason. This is the dependency-chain-aware build (see
   [build system](/process/build-system.md)) - releasing `core-server` also rebuilds everything
   upstream of it. Then `make clean-install-$PACKAGE` (`scripts/checks/clean-install/{cli,manifest}.ts`)
   packs the package, installs it ALONE into an empty project with only its required peers plus the
   peers the manifest grants each sub-path, and loads every published sub-path under Bun - plus a browser build for every entry the purity gate
   claims - with both the hoisted and the isolated linker. The workspace hoists every
   optional peer, so a sub-path that leaks one looks fine everywhere else. CI runs `make clean-install` for every
   package. The release workflow still sets up Node 24, only to write the npm auth and run `npm version`.
6. Build artifacts are validated against the package's own `exports` map: every file any condition
   names must exist. The list is never hand-written. The hand-written one it replaced named a few
   packages and went stale the day more were added.
7. Three dependency gates then run, still before anything is bumped or pushed. `make catalog-check`
   asserts the workspace catalog has not drifted. A policy step greps this workflow file to confirm
   the publish step still says `bun publish`. The package is then packed ONCE with `bun pm pack`,
   and two checks read that one manifest: it must carry no unresolved `catalog:` or `workspace:`
   protocol, and every runtime dependency must resolve to a real published version on the registry.
8. Version bump: `cd $PACKAGE_PATH && npm version $BUILD_MODE --no-git-tag-version
   --workspaces-update=false`. Then `git fetch origin && git checkout develop && git pull origin
   develop`, so the commit later lands on the latest `develop` rather than the checkout's stale ref.
9. Publishes, BEFORE any git write: `bun publish --access public --tag <dist-tag> --ignore-scripts`
    from the package directory. It must be `bun publish`, never `npm publish`: bun resolves the
    `catalog:` / `workspace:` protocol while packing, whereas npm ships it verbatim into the tarball
    and the published manifest is then uninstallable for every consumer. Auth is passed as
    `NPM_CONFIG_TOKEN` rather than `NODE_AUTH_TOKEN`, because bun ignores the `.npmrc` that
    `actions/setup-node` writes and reads neither `NODE_AUTH_TOKEN` nor `BUN_AUTH_TOKEN`.
    `patch|minor|major` publish under the `latest` npm tag; any `pre*` mode publishes under `next`.
    `--ignore-scripts` is used because the build already ran in step 5. `IS_PUBLISHED` is set BEFORE
    the publish command, so a publish that succeeded and lost its response is still reported.
10. Best-effort: tries to move the `highest` npm dist-tag to the version just published (publishes
    are monotonic, so the latest publish is always the highest version); failure here is logged but
    does not fail the job.
11. Only now does git change: commit `package.json` as `chore(<package>): release v<version>
    [<build_mode>]`, push to `develop`, then tag `<package>-v<version>` and push the tag. The push
    rebases and retries once, because `develop` can move between the sync and the push.
12. There is no rollback, by design. Publishing runs first, so a failed run either touched neither
    the registry nor the remote, or it published and only bookkeeping is left undone. Two report
    steps say which: one when the publish landed but `develop` was not updated (it prints the
    `npm version` command to fix `develop` by hand), one when only the tag is missing. npm cannot
    un-publish, and force-pushing `develop` to chase a live version does more damage than the
    mismatch it would fix.
13. To check whether a release "actually happened": look at the run's `IS_PUBLISHED` and `IS_PUSHED`
    env flags, then check the registry, and check `develop` for the
    `chore(<package>): release v<version> [<build_mode>]` commit and the `<package>-v<version>` tag.

## Related

- [Build system](/process/build-system.md)
- [Git workflow](/process/git-workflow.md)
