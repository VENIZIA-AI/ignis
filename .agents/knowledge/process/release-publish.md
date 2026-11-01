---
type: Playbook
title: Release and publish
description: 'How to run the manually-triggered NPM release workflow: one run that releases a plan of IGNIS packages.'
resource: .github/workflows/package-release.yml
tags: [process, release, ci]
---

<!-- okf:generated:contents start -->
**Contents**

- [Two kinds of release](#two-kinds-of-release)
- [Before a chain release](#before-a-chain-release)
- [What atlas reads after a release](#what-atlas-reads-after-a-release)
- [The VULCAN preset](#the-vulcan-preset)
- [The five jobs and their guards](#the-five-jobs-and-their-guards)
- [Trusted publishing (no npm token)](#trusted-publishing-no-npm-token)
- [The GitHub Release of a run](#the-github-release-of-a-run)
- [The prebuilt atlas index of this repository](#the-prebuilt-atlas-index-of-this-repository)
- [Steps](#steps)
- [Related](#related)
<!-- okf:generated:contents end -->

## Two kinds of release

The mode decides the kind (`scripts/release/release-kind.ts`): `prerelease`, `prepatch`, `preminor` and `premajor` are a
prerelease, `patch`, `minor` and `major` are a stable (`npm version patch` over `0.4.9-3` gives the stable `0.4.9`, so a
run cannot mix kinds).

|                                 | Prerelease                                                                            | Stable                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dispatched on and released from | `develop`                                                                             | `main`                                                                                                                                                                   |
| Release commits go to           | `develop`                                                                             | `main`                                                                                                                                                                   |
| Plan                            | what changed since each package's last release, plus the packages that depend on them | the scope of the mode, never named: a `patch` promotes every package that has a prerelease part, a `minor` or a `major` moves all nine (they must share one MAJOR.MINOR) |
| npm dist-tag                    | `next`                                                                                | `latest`                                                                                                                                                                 |

The dist-tag follows the version of each package (a prerelease part means `next`), not the mode. The plan job refuses a ref
that is not the kind's branch, and a stable plan whose scope is not the mode's (a package left out, a patch over a stable
package, a plan whose `from` is not the version on `main`); a package already released by an earlier dispatch of the same
plan does not count against the scope. `release.ts --dry-run` prints version now, target and dist-tag for each package. The
loop computes each target without npm (`ReleaseVersion.next`, checked against `npm version`) and stops before publishing if
npm gives another version, and a stable run refuses a packed manifest that pins a prerelease.

## Before a chain release

- Pass `--issue <N>` - the release issue - so the commits a release makes (the workflow's
  `chore(<package>): release v...`) lead with `[#N]` like every other commit. The workflow takes
  it as its optional `issue` input.
- Release a prerelease from `develop` through `bun scripts/release/release.ts` (`--dry-run` first): it plans the packages, prints
  the plan as a ready `--plan` value and dispatches this workflow ONCE, with the plan. The workflow releases the packages
  in dependency order (dev-configs, inversion, filter, helpers, boot, kernel, connectors, core-worker, core-server) in
  that one run. The script refuses an unpushed or non-`develop` checkout because the workflow releases the commit it was
  dispatched on, and it names `--ref` on every dispatch (`develop` for a prerelease, `main` for a stable; the default branch is not where a release runs). It
  watches the run with no time limit (`scripts/release/release-watch.ts`), reads one line per package of the plan from the log
  (`+ <name>@<version>`: published by this run; `= <name>@<version>`: already released), and then waits until the tarball
  of every released version answers 200 (`scripts/release/release-tarballs.ts`, up to fifteen minutes each, in parallel),
  because the registry lists a version minutes before its file is downloadable; the release is reported done only then.
- **A run that stopped is continued by sending the same plan:** `bun scripts/release/release.ts --plan <the printed plan>
  --mode <mode> --issue <N> --yes`. A package already released is skipped, one that is on npm without its release commit or
  tag gets them without a second publish, and a package whose version in git is neither the one the plan started from nor
  the exact version the plan would release from it (the target `npm version <mode>` gives) stops the run before anything is
  published (the plan is stale), even when that other version is on npm and tagged. Do not plan again after a stop: a package that only cascaded from a
  sibling the first run released would drop out of the plan.
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

- **Package names on the command line.** `release.ts <pkg>` means "from this package on"; `--plan` carries its own
  packages and cannot be combined with names. The parsing lives in `scripts/release/release-args.ts` with its own test.

## The VULCAN preset

`@venizia/ignis` ships a data-only VULCAN preset (`vulcan.presets.app`, `vulcan.presets.lib` and `vulcan.presets.shared` in its `package.json`), so `vulcan init --preset ignis` creates a working monorepo. It has three kinds: `presets/app` (`vulcan add --preset ignis --app <name>`, derived from `examples/5-mins-qs`), `presets/lib` (`--lib <name>`, a library other IGNIS apps import: `exports` to `src`, `@venizia/ignis` as a peer, no `server:dev` or `compile`) and `presets/shared` (`--shared <name>`, needs a VULCAN with `--shared`, 0.4.9-0 or later). The shared kind is a side-neutral package that backend and frontend apps both import; it is not the lib kind and never replaces it. It depends on no IGNIS or ARDOR package: `@venizia/dev-configs` is the one `@venizia/*` name it may list, as a devDependency, and a test (`scripts/preset/__tests__/shared-preset.test.ts`) fails on any other. Its tsconfig extends nothing from dev-configs (no decorators, no DOM, no Bun API in `src`). Each is `preset.json` with `workspace:*` / `catalog:` markers plus `files/`; the lib and the shared kind also get the app's `.configs/` lint and format files and its lint and clean scripts at build time. `scripts/preset/vulcan-preset.ts` (`make preset-build`) resolves the markers to the exact workspace versions and the root-catalog ranges and writes `dist/presets/app`, `dist/presets/lib` and `dist/presets/shared`, named by `vulcan.presets.app`, `vulcan.presets.lib` and `vulcan.presets.shared`; an older VULCAN ignores the `shared` key; the release loop runs it after the `core-server` bump, so the preset names the release it ships in. `make preset-smoke` (`scripts/preset/preset-smoke.ts`) packs the workspace, creates an app from the packed preset in a temp folder and runs its typecheck, lint and test, then `vulcan doctor` and `okf check`, and calls `GET /api/hello`; it gates the `core-server` release before the bump, and CI runs it after the build. `bun pm pack` drops every `__tests__` folder, so the preset keeps its smoke test at `src/smoke.test.ts`.

## The five jobs and their guards

The workflow takes a `plan` (`name@version,...`: the package folders and the version each has now), a `build_mode`
(default `prerelease`) and an `issue`, and runs five jobs. `plan` holds no secret and no environment: it validates the
input (known names, semver, no duplicate), orders it in dependency order, refuses a ref that is not the branch of the kind
(`GITHUB_REF`; see [Two kinds of release](#two-kinds-of-release)) and a stable plan that is not the scope of the mode, and
outputs the plan, the `kind`, the `branch`, a `headline` (`<n> packages, up to <highest target>`) and the `targets`; every
other job takes that output, never the raw input, and no `run:` step interpolates `${{ }}`. For a stable it also checks out
the full history and tries the merge of `main` back into `develop` in throwaway worktrees
(`merge-back.ts trial --versions <dir=version,...> --lock keep`), so a merge that would stop stops before anyone is asked;
its `develop_sha` is the head of `develop` the trial read. `test` is a matrix, one job per package of the
plan, with read-only permissions and no secret: it builds, runs the checks in the steps below, the package's unit tests
(`make test-$PACKAGE`) and the preset smoke for `core-server` against the VULCAN version the repository declares in
`devDependencies` (never `latest`). `scripts` runs the repository scripts' tests once (`make test-scripts`, which hold the
guards below). `approve` exists for a stable only (`if` on the plan's kind), `needs` the three jobs above so nobody
approves a run that fails a gate, names the environment `release-approval` (reviewer: the owner; `main` only), holds no
permission and runs one echo; the click is the approval, its name carries the `headline`, and nothing waits for a second
one. `publish` `needs` all four and runs after `approve` succeeded, or after it was skipped because the plan says
prerelease and `plan`, `test` and `scripts` succeeded, under `!cancelled()` (the guard evaluates the written `if` over its
cases). It is the only job with `contents: write` and `id-token: write`, names the environment `npm-release` (no
reviewers), has a `timeout-minutes` (nine publishes, each followed by a wait of up to fifteen minutes), builds once and
runs the loop (`scripts/release/release-run.ts run`, with `TARGET_BRANCH` from the plan). A stable first refuses to start
when `main` is not the dispatched commit or `develop` is not the `develop_sha` the trial read, before any step changes a
file, writes git or publishes. After the loop a stable merges once: it copies `merge-back.ts` out of the checkout, adds a
detached worktree of `origin/develop`, runs the copy with `apply --repo` on it and pushes `develop` from it. The runner's
checkout stays on the last release commit and may be dirty (the install edits manifests that no release commit
includes). A stop there is continued by dispatching the same plan again on `main`: a new run with a new approval, which
publishes and tags nothing and merges back. It holds no registry token and no secret: the publish and the dist-tag
steps sign in through npm trusted publishing (see [Trusted publishing](#trusted-publishing-no-npm-token)). Every job checks out
`${{ github.sha }}`, the dispatched commit, never a branch name, and the run name carries it. Bun and Node are exact
versions, the Node setup does not cache, and every action is pinned by a full commit with its tag in a comment.

`scripts/release/release-workflow.ts` reads the workflow and the loop and names every guard that is missing;
`scripts/release/__tests__/release-workflow.test.ts` removes each guard from a copy, one at a time, and
expects the check to name it (listed in `scripts/checks/controls.json`). Change a guard on purpose, and its
mutation in that test, in the same pull request. There are 38. The ones for trusted publishing are `no-npm-token` (no
`secrets.` reference and no npm token name in the workflow or in the loop), `environment-on-publish`, `oidc-on-publish-only`,
`node-exact-no-cache`, `npm-exact-and-asserted` and `publish-tarball-with-provenance` (`bun publish` appears nowhere, the loop
packs with `bun pm pack`, publishes with `npm publish` and `--provenance`). The ones for the shape of one run are
`one-plan-input`, `default-mode-prerelease`, `plan-job-first`, `matrix-over-plan`, `build-once`, `publish-runs-the-loop`,
`no-interpolation-in-run`, `publish-timeout`, `gates-needed`, `gate-jobs-hold-no-secret` and `write-on-publish-only`. The ones
for the two kinds are `ref-by-kind` (the plan job, not a literal branch, checks the ref), `approve-for-stable-only` (one job
names `release-approval`, for a stable, after the gates, `permissions: {}`, one echo, the headline in its name),
`publish-after-approve` (the `if` is evaluated over its cases, `scripts/release/release-publish-condition.ts`),
`stable-refuses-moved-branches`, `plan-tries-the-merge-back`, `merge-back-from-a-copy`, `target-branch-by-kind` and
`no-force-or-tag-move` (no force push, no tag moved or deleted, no branch deleted, in the workflow, in the loop or in
`github-release.ts`). Three hold the GitHub Release of the run (see
[The GitHub Release of a run](#the-github-release-of-a-run)): `github-release-never-fails-a-publish` pins the step (one
exact command, only the keys `name`, `continue-on-error`, `timeout-minutes`, `env` and `run`, exactly the three
variables, a timeout of 1 to 10 minutes, no secret); `github-release-only-views-and-creates` reads the script (the rule
itself is enforced at run time, see the section, so the guard pins that `ghOf` checks the arguments before its one
spawn, that every `gh` and `git` call passes an inline array of words, and that the script has no `fetch`, Bun shell,
`child_process` or token name); and `publish-environment-is-closed` (no `defaults` anywhere, no `env` on the publish
job, the workflow `env` is exactly `BUILD_MODE`, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` and `TARBALLS`, and a publish
step writes `$GITHUB_ENV` only as `MERGE_BACK_STARTED=true` and `$GITHUB_PATH` never). `publish-runs-the-loop` also
refuses two steps of the same name in the job, because a step is found by its name. The guards
read commands with comments stripped, and `no-npm-token` (which reads `github-release.ts` too) names the file and the line. What the loop does with the tarball (the
sha256 recorded and checked again before the publish, the version inside it, the pins of the siblings, the order of every
call, the skip and heal states) is not a text guard: `scripts/release/__tests__/release-run.test.ts` runs the loop against a
fake runner, registry and remote, and mutating the loop turns it red. `scripts/release/__tests__/release-repository.test.ts`
keeps every published `package.json` naming this repository, which provenance requires.

## Trusted publishing (no npm token)

The release job holds no npm token. It has `id-token: write` (it alone), installs an exact npm that is new
enough to publish and to move a dist-tag over OIDC (the one that ships with Node is older) and asserts it,
and npm exchanges the job's identity for a short-lived publish credential. For that, each of the nine
packages has a **trusted publisher** on npmjs.com (package Settings, Trusted Publisher, GitHub Actions):
organisation `VENIZIA-AI`, repository `ignis`, workflow filename `package-release.yml`, environment
`npm-release`, and the allowed actions `npm publish` and `npm dist-tag`. The nine packages are
`@venizia/dev-configs`, `@venizia/ignis-inversion`, `@venizia/ignis-filter`, `@venizia/ignis-helpers`,
`@venizia/ignis-boot`, `@venizia/ignis-kernel`, `@venizia/ignis-connectors`, `@venizia/ignis` (`core-server`)
and `@venizia/ignis-worker` (`core-worker`).

- npm does not validate an entry when it is saved: a typo shows only at that package's first publish. Each
  package is published by the same run, so a bad entry fails the publish of that package: the packages before it in the
  plan are already released and recorded, and dispatching the same plan again continues from it.
- A publish needs the repository, the packages and the `repository.url` of every `package.json` to match
  this repository (`git+https://github.com/VENIZIA-AI/ignis.git`, with the package's `directory`).
- The environment's ref rule (`develop` and `main`) is a GitHub setting that only the owner writes. `npm-release` has
  had no reviewers since 2026-10-29, so a dispatch publishes without a pause: only the owner dispatches a release.
- Only `bun pm pack` resolves `catalog:` and `workspace:` while packing; `npm publish` of a bun-packed
  tarball keeps that. The loop packs each package after its version bump (and the preset, for `core-server`), records the
  sha256 of the tarball, and checks it again before it publishes that very file. Bun 1.4.4 reads a sibling's version from
  its `package.json` on disk at pack time (measured: no `bun install` is needed between a bump and the pack of the next
  package), and the loop checks the pin of every sibling in the packed manifest anyway.
- The repository secret that held the old token is already deleted. After the first release over trusted
  publishing has passed, the owner sets each package's Publishing access to disallow tokens and revokes the old token.

## The GitHub Release of a run

Every run, prerelease or stable, ends with ONE GitHub Release, made by `scripts/release/github-release.ts create --targets "$TARGETS" --kind "$RELEASE_KIND"` in the step "Create the GitHub Release" of the `publish` job (after "Release the plan", before the merge back). It is uniform with VULCAN and covers new releases only; older tags have none.

- **The tag is the last package's.** A run tags each package `<dir>-v<version>`; the Release goes on the tag of the last package of the plan in release order (`core-server` when it is in the plan), and its title is `IGNIS <version>` when that package is `core-server` and `IGNIS <dir> <version>` otherwise (`IGNIS kernel 0.4.6`), so two titles never collide. The previous tag and the newest stable are read from the tags of that one package, never from another package's.
- **Prerelease:** flagged Pre-release, never Latest. The body is `Install: npm install <npm name of the last package>@next`, then the `[#N]` commit subjects since the previous tag of that package (at most 30, in a fenced block, release commits left out).
- **Stable:** GitHub has one Latest per repository, so `--latest` only when the last package is `core-server` AND no stable `core-server` tag is above it; every other stable gets `--latest=false`. The body is the user-facing changelog entries added since the previous stable tag of that package (front matter, date heading and badge line removed), or `No change for users of the packages in this release.` when there are none. A bare `@word` or `@org/team` in an entry is put in backticks (a Release notifies the account or team it names), and a root-relative link `](/path)` points at `https://ignis.venizia.ai`.
- **Limits:** a body over 120000 characters (GitHub's limit is 125000) is cut on a whole line, with a closing line that says so and links to `https://ignis.venizia.ai/changelogs/`; the Packages section stays. A message of `gh` or `git` has its line breaks turned into spaces before it reaches the log or the run summary, so it cannot start a workflow command (`::add-mask::`).
- **Both end with `## Packages`:** one line per package of THIS run, in release order, `- [<npm name>@<version>](https://www.npmjs.com/package/<npm name>/v/<version>)`. The npm names come from `.agents/vulcan.manifest.json` `packages`, matched by `dir`.
- **Never a second, never a failure.** A tag that already has a Release is skipped, so dispatching the same plan again makes a missing Release and never a second one. The step has `continue-on-error: true` and a 5-minute timeout, reads no secret (`GH_TOKEN` is the job's own `github.token`, `contents: write` is already there) and reports in the run summary; a failure never fails or undoes a publish. The guards `github-release-never-fails-a-publish` and `github-release-only-views-and-creates` hold all of that. The script refuses the tag `atlas-index`, and `ghOf`, the one place a process is spawned, refuses at run time (it throws before spawning, which `create` reports as a failed outcome) any `gh` call that is not `release view` or `release create`, any forcing argument (`--force`, `-f`, `--delete`, `-d`, `-D`, `--cleanup-tag`) and any call that names `atlas-index`. A message line of a dry run starts with `| ` after the first, because the runner trims spaces before it looks for `::`.
- **By hand:** `bun scripts/release/github-release.ts backfill --tag <tag> [--yes]` makes the Release of one existing tag (a dry run that prints the planned body without `--yes`). The workflow never calls it.

## The prebuilt atlas index of this repository

IGNIS publishes the atlas index of its own commits, so a project that declares IGNIS as a source downloads it instead of building it. The `atlas-index` job of `.github/workflows/deploy-docs.yml` (the workflow "Docs", which also deploys the wiki) runs on a push to `main`, to `develop` or of a tag, builds the index through VULCAN's action (`VENIZIA-AI/vulcan/.github/actions/atlas-index`, pinned by full commit to the installed VULCAN release; a bump is a deliberate pull request), signs it with the Actions secret `ATLAS_INDEX_KEY` and attaches the pair to the release `atlas-index`. The public half of the key is `atlas.index.keys` in `.configs/vulcan.config.mts`, rendered into `.agents/vulcan.manifest.json`; a reader accepts a pair only when a listed key verifies it, and otherwise builds locally as before. The job has `contents: write` and nothing else does; the secret is read only by the publishing step; `scripts/release/__tests__/docs-workflow.test.ts` holds those rules.

**Release tags get no pair from it.** The release workflow pushes its release commits and tags with the Actions token, and GitHub starts no workflow from a push made with that token, so a release tag of IGNIS gets no pair from that job; the next push to `develop` covers the head. VULCAN 0.4.7 runs the action from its own release; IGNIS gets that when it moves to it. The release keeps the newest 20 branch-head pairs and every release-tag commit's pair, 300 pairs at most. A new key is made with `bun x --no-install vulcan x atlas index keygen` by the maintainer, who sets the secret; an agent never writes it.

## Steps

1. This is a `workflow_dispatch` workflow ("Release"; its publish job is still named "NPM Release", which the trusted
   publishers and the environments know the file by, not the title) - it never runs on push, tag, or PR. A human triggers it, in
   practice `release.ts` does (`gh workflow run package-release.yml --ref develop`), with four inputs:
   - `plan` (required): `name@version,...`, the folders under `packages/` and the version each has now.
   - `build_mode`: the semver bump - `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, or `prerelease`
     (default `prerelease`, so a dispatch that names no mode never publishes under `latest`).
   - `issue`: the issue number the release commits serve.
   - `label` (optional): the run title, filled in by `release.ts` (`stable · 0.4.6 boot,kernel; 0.4.5 filter · #664 · c84852a`: the
     kind, each version with its packages, the issue, the short commit). The run name cannot see the plan, so the dispatcher says
     it and the `plan` job refuses a label that is not the one it computes (`ReleaseTargets.labelOf`); the title cannot name a
     release the run does not make. A dispatch by hand has none, and the title is the mode, the issue and the whole commit.
     `release.ts` sends `label` only when the workflow file on the branch it dispatches on declares it (GitHub refuses an input
     the file does not declare, and `main` has none until the Sync), and the guard `plan-checks-the-label` allows no other reader
     of `inputs.label` and no `continue-on-error` in the plan job.
     A repository-wide `concurrency: npm-release` group serialises runs. A second dispatch waits; a third cancels the waiting
     one. `docs/wiki` (`@venizia/ignis-docs`) is not in the plan: it is not republished through this workflow.
2. `plan` validates the input and outputs the ordered plan and the test matrix.
3. `test`, once per package of the plan: `bun run --filter "@venizia/*" force-update workspace` runs BEFORE `bun install`, and
   over the WHOLE workspace rather than the one package.
   - It skips a sibling of this repository: manifests name siblings `workspace:*`, which `bun pm pack` writes as the sibling's exact version in the tarball (a caret let a fresh install pair one release with the next release's sibling), while development keeps linking the workspace copy. An exact version in the manifest would stop linking the moment the sibling bumps.
   - Before the install, because `force-update` rewrites the internal version ranges and an install
     that ran first has already resolved the old ones. When a sibling has moved past a declared
     range, that range no longer covers the workspace copy, so bun downloads the published tarball
     and the build type-checks against a package one release behind.
   - Over the whole workspace, because `bun install` resolves every member: one stale range anywhere
     fails the run, even in a package the release does not touch.

   Internal dependencies stay literal `^x.y.z` ranges rather than bun's `workspace:` protocol. The
   protocol fixes the install side - it always links the workspace copy - but it resolves the
   PUBLISHED floor from the version recorded in `bun.lock`, and bun 1.3.14 never refreshes that
   record on a version bump (measured against `bun install`, `--force` and `--lockfile-only`). A
   package would then publish a floor one release behind, silently. Loud beats silent here.

   Then `bun install`, and an assertion that every `@venizia/*` dependency resolves to the workspace and not to a registry
   tarball (each one is a member of this workspace, so a tarball is always wrong, and otherwise invisible because the install
   succeeds). Build, lint and purity go through the SAME Makefile targets you'd use locally: `make $PACKAGE`,
   `make lint-$PACKAGE`, `make purity-test`, then `make purity-$PACKAGE` (the probe's own regression tests run first, so a
   probe that silently stopped detecting anything cannot leave the gate green for the wrong reason). This is the
   dependency-chain-aware build (see [build system](/process/build-system.md)). Then `make clean-install-$PACKAGE`
   (`scripts/checks/clean-install/{cli,manifest}.ts`) packs the package, installs it ALONE into an empty project with only its
   required peers plus the peers the manifest grants each sub-path, and loads every published sub-path under Bun - plus a
   browser build for every entry the purity gate claims - with both the hoisted and the isolated linker. Build artifacts are
   validated against the package's own `exports` map: every file any condition names must exist; the list is never
   hand-written. `make catalog-check` asserts the workspace catalog has not drifted. The package is packed with
   `bun pm pack` and two checks read that manifest: it must carry no unresolved `catalog:` or `workspace:` protocol, and every
   runtime dependency must be served by the registry (`release-run.ts registry`: a version the packument lists or whose
   tarball answers 200, so a sibling released minutes ago passes; no `chain_released` input exists any more). Last, the unit
   tests and, for `core-server`, the preset smoke. `scripts` runs `make test-scripts` once.

4. `publish`, after every gate: checkout, Node, Bun, an exact npm, `force-update workspace`, `bun install`, and ONE build for
   all nine packages (`make core-server core-worker boot`). Then `release-run.ts run` loops the plan.
5. For each package, in dependency order. Its state first: the version in git is the plan's (release it), or it is above the
   plan's - on npm with its tag on origin (done, skipped), on npm with the tag missing (the tag is written on the existing
   release commit once the tarball answers 200), not on npm (stop) - or below it (stale plan: stop). Then: bump
   (`npm version $BUILD_MODE --no-git-tag-version --workspaces-update=false`); if the new version is already on npm
   (packument or tarball, read fresh) the run records it without publishing; the preset for `core-server`; `bun pm pack`
   into `$TARBALLS/<package>.tgz`; the packed manifest is checked (no protocol, the target version, every sibling pinned to the
   version the workspace has now, a sibling outside the run present on npm); the sha256 is checked against the one recorded
   at the pack; `npm publish "$TARBALLS/<package>.tgz" --access public --tag <dist-tag> --ignore-scripts --provenance`
   (no token: npm signs in with the job's identity and writes the provenance; `patch|minor|major` publish under `latest`,
   any `pre*` mode under `next`; `--ignore-scripts` because the build already ran); the line `+ <name>@<version>`; a wait
   until the tarball answers 200; the `highest` dist-tag, moved only if the new version is semver-greater than the current
   one (a stable shipped late never moves it back; best-effort); `sync-next-tag.ts` (best-effort).
6. Only now does git change for that package: commit `package.json` as `[#N] chore(<package>): release v<version> [<build_mode>]`,
   a plain push to `develop`, then the annotated tag `<package>-v<version>` and its push. The next package starts only
   after that. A push that is rejected (`develop` moved) stops the run: nothing rebases, because a rebase would bring other
   commits into the working tree between two packs while the build ran once on the dispatched commit.
7. When the loop is done, the step "Create the GitHub Release" makes the Release of the run on the tag of the last package
   (see [The GitHub Release of a run](#the-github-release-of-a-run)). It cannot fail the run. A stable then merges `main`
   back into `develop`.
8. There is no rollback, by design. The publish comes before the git writes, so after any stop git equals the registry
   except for a package that published and could not be recorded; the log names that package and the missing half (the
   release commit, the tag). npm cannot un-publish, and force-pushing `develop` to chase a live version does more damage than
   the gap. Dispatch the same plan again: it records what is missing without publishing twice.
9. To check whether a release "actually happened": the run's log has a `+` or `=` line per package, the registry serves the
   versions, and `develop` has the `chore(<package>): release v<version> [<build_mode>]` commit and the
   `<package>-v<version>` tag for each.

## Related

- [Build system](/process/build-system.md)
- [Git workflow](/process/git-workflow.md)
