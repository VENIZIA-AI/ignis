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
   - `package`: one of `dev-configs`, `inversion`, `helpers`, `boot`, `core`, `docs-mcp`.
   - `build_mode`: the semver bump - `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`,
     or `prerelease` (default `patch`).
2. The job resolves `PACKAGE_PATH` from the chosen package (`docs-mcp` maps to `docs/wiki`,
   everything else to `packages/<name>`), reads its current `package.json` name/version, and
   determines which `dist/` subdirectories must exist afterward: `dist/mcp-server` for `docs-mcp`,
   `dist/cjs dist/esm` for `inversion`/`boot`, plain `dist` for everything else.
3. It runs `bun install`, then `bun run --filter "<package name>" force-update "highest"` to pull
   the latest allowed versions of that package's own dependencies before building.
4. Build and lint go through the SAME Makefile targets you'd use locally: `make $PACKAGE` then
   `make lint-$PACKAGE`. This is the dependency-chain-aware build (see
   [build system](/process/build-system.md)) - releasing `core` also rebuilds everything upstream
   of it.
5. It validates the build artifacts directly: for each expected `dist` subdirectory it asserts
   both `index.js` and `index.d.ts` exist, failing the job if not.
6. Version bump: `cd $PACKAGE_PATH && npm version $BUILD_MODE --no-git-tag-version
   --workspaces-update=false`, then commits `package.json` with message
   `chore(<package>): release v<version> [<build_mode>]` and pushes straight to `develop`
   (`git fetch origin && git checkout develop && git pull origin develop` first, to commit onto
   the latest `develop`, not the checkout's stale ref).
7. Tags the commit `<package>-v<version>` and pushes the tag.
8. Publishes: `npm publish --access public --tag <dist-tag> --ignore-scripts` from the package
   directory. `patch|minor|major` publish under the `latest` npm tag; any `pre*` mode publishes
   under `next`. `--ignore-scripts` is used because the build already ran in step 4.
9. Best-effort: tries to move the `highest` npm dist-tag to the version just published (publishes
   are monotonic, so the latest publish is always the highest version); failure here is logged but
   does not fail the job.
10. On any step failure, a rollback step runs: deletes the git tag (local + remote) if it was
    created, and if the version-bump commit was already pushed to `develop`, it does
    `git checkout develop && git reset --hard HEAD~1 && git push --force origin develop`. If NPM
    publish already happened before the failure, the rollback step only prints a reminder to run
    `npm deprecate` manually - it cannot un-publish.
11. To check whether a release "actually happened": look at the workflow run's steps for
    `IS_PUSHED`, `IS_TAG_CREATED`, `IS_PUBLISHED` env flags, and check `develop` for the
    `chore(<package>): release v<version> [<build_mode>]` commit and the `<package>-v<version>`
    tag.

## Related

- [Build system](/process/build-system.md)
- [Git workflow](/process/git-workflow.md)
