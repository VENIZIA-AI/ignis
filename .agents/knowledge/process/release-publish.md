---
type: Playbook
title: Release and publish
description: How to run the manually-triggered NPM release workflow for an IGNIS package.
resource: .github/workflows/package-release.yml
tags: [process, release, ci]
---

## Steps

1. This is a `workflow_dispatch` workflow ("NPM Release") - it never runs on push, tag, or PR. A
   human triggers it from the GitHub Actions tab (or `gh workflow run`) and picks two required
   inputs:
   - `package`: one of `dev-configs`, `inversion`, `filter`, `helpers`, `boot`, `kernel`,
     `connectors`, `core-server`, `core-worker`, `docs-mcp`.
   - `build_mode`: the semver bump - `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`,
     or `prerelease` (default `patch`).
   A repository-wide `concurrency: npm-release` group serialises runs. A second dispatch waits; a
   third one cancels the waiting one, because the chain has to be released in order anyway.
2. The job resolves `PACKAGE_PATH` from the chosen package (`docs-mcp` maps to `docs/wiki`,
   everything else to `packages/<name>`) and reads its current `package.json` name and version.
3. `bun run --filter "@venizia/*" force-update "highest"` runs BEFORE `bun install`, and over the
   WHOLE workspace rather than the one package being released.
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
   upstream of it.
6. Build artifacts are validated against the package's own `exports` map: every file any condition
   names must exist. The list is never hand-written. The hand-written one it replaced named three
   dual-build packages and went stale the day four more were dual-built.
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
