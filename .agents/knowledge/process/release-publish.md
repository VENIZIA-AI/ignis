---
type: Playbook
title: Release and publish
description: How to run the manually-triggered NPM release workflow for an IGNIS package.
resource: .github/workflows/package-release.yml
tags: [process, release, ci]
---

## Before a chain release

- Pass `--issue <N>` - the release issue - so the commits a release makes (the workflow's
  `chore(<package>): release v...` and any table refresh) lead with `[#N]` like every other
  commit. The workflow takes it as its optional `issue` input; VULCAN's release-table generator
  (`make releases-gen`) reads release subjects with or without that prefix.
- Release from `develop` through `bun scripts/release.ts` (`--dry-run` first): it dispatches this
  workflow one package at a time in dependency order (dev-configs, inversion, filter, helpers, boot,
  kernel, connectors, core-worker, core-server), waits for each run, and reads the registry back
  before the next dispatch - a range that goes stale mid-flight fails the run. The script refuses an
  unpushed or non-`develop` checkout because the workflow builds `origin/develop`.
- Measure the downstream consumer before dispatching, not after: copy the consumer repository to a
  temp directory without `node_modules`, recreate its `node_modules` as symlinks to the original
  entries with every `@venizia/*` entry pointed at the freshly built `packages/<name>` (dependency
  versions pinned to the consumer's own resolved copies, or two `zod`/`hono` trees land in one
  program), run `tsc --noEmit` per consumer package, and diff against the same run with the
  pinned versions. Every new error must map to a documented breaking change; the rest is the
  finding. The public-surface snapshot tracks names and kinds only, so this is the check for
  signatures.

## The generated tables

`.agents/knowledge/reference/{public-surface.md, symbols.json, releases.json}` are written by VULCAN's
`surface-gen`, `symbols-gen` and `releases-gen` targets (`make` includes them from
`node_modules/@venizia/vulcan/base/make/vulcan.mk`). IGNIS no longer ships them in a package: atlas
is not an IGNIS package, so it is not part of the release chain and has no tail step.

- **Why they lag a release.** `releases.json` is generated FROM release commits and `symbols.json`
  from built declarations, so they are always one chain behind until regenerated. `release.ts`
  regenerates both after the last package of a chain and commits them when they moved.
- **Why `releases-check` is not a build gate.** It is red between a release and that regeneration.
  It stays a target a human runs, never part of `make build-all`.
- **Package names on the command line.** `release.ts <pkg>` means "from this package on". Before
  #172 the first name was dropped unless `--chain-released` was passed (`args[seedIndex + 1]` with
  `seedIndex = -1`); the parsing now lives in `scripts/release-args.ts` with its own test.

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
   upstream of it. Then `make clean-install-$PACKAGE` (`scripts/clean-install/{cli,manifest}.ts`)
   packs the package, installs it ALONE into an empty project with only its required peers plus the
   peers the manifest grants each sub-path, and loads every published sub-path under Bun `import`,
   Node ESM `import` and Node `require` - plus a browser build for every entry the purity gate
   claims - with both the hoisted and the isolated linker. A sub-path the manifest lists under
   `importedAfter` also loads under Bun from one ESM entry followed by those peers: the
   `@venizia/ignis/postgres/postgres-js` alias, whose CommonJS build crashed when an app imported
   `postgres` after it. Only the hoisted linker reproduces that crash. The workspace hoists every
   optional peer, so a sub-path that leaks one looks fine everywhere else. CI runs `make clean-install` for every
   package, with Node 24 installed for the Node checks.
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
