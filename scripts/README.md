# scripts/

Root tooling of the IGNIS monorepo, grouped by purpose. Each group keeps its tests in its own
`__tests__/`. `scripts/tsconfig.json` type-checks all of it (`make lint-scripts`).

| Group         | Script                          | What it does                                                                                                                                                                  | Called by                                                                        |
| ------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `release/`    | `release.ts`                    | Plans and dispatches the Release workflow, one run for the whole plan, in dependency order                                                                                    | `bun scripts/release/release.ts` (dry run first)                                 |
| `release/`    | `release-args.ts`               | Reads `--mode`, `--issue`, `--dry-run`, `--yes` and the package names                                                                                                         | `release.ts`                                                                     |
| `release/`    | `sync-next-tag.ts`              | Moves the `next` dist-tag up to `latest` after a stable publish                                                                                                               | `package-release.yml`, step "Keep next at or above latest"                       |
| `release/`    | `github-release.ts`             | Makes the one GitHub Release of a run, on the tag of its last package; `backfill --tag` makes one by hand                                                                     | `package-release.yml`, step "Create the GitHub Release"                          |
| `preset/`     | `vulcan-preset.ts`              | Writes the VULCAN presets (`presets/app`, `presets/lib`, `presets/shared`) into `@venizia/ignis` with exact versions                                                                            | `make preset-build`, `package-release.yml`                                       |
| `preset/`     | `preset-smoke.ts`               | Creates an app and a library from the packed preset and runs their checks                                                                                                     | `make preset-smoke` (CI, release workflow)                                       |
| `checks/`     | `purity/`                       | The browser-purity CLAIMS; the engine is `devz check purity` in `@venizia/dev-configs`. Bundles every entry claimed browser-pure and fails on a node builtin or global        | `make purity-<pkg>` (CI, release workflow), `make purity`, `bun run purity`      |
| `test-setup/` | `tmpdir.ts`                     | Bun test preload: sets `TMPDIR` and `NODE_COMPILE_CACHE` inside the repository for a bare `bun test`                                                                          | `[test] preload` in the root and package `bunfig.toml`                           |
| `checks/`     | `tmp-leak/`                     | Fails when a test run leaves anything new in the system temp or in `.agents/local/tmp`; lists the sanctioned system-temp paths                                                | `make tmp-leak-check` (CI, around the test steps)                                |
| `checks/`     | `__tests__/wiki-shared.test.ts` | Fails when the shared wiki theme folder differs from its `SHARED.json`, or a VitePress piece its CSS overrides is gone; identical in the IGNIS, ARDOR and VULCAN repositories | `make test-scripts`                                                              |
| `checks/`     | `clean-install/`                | Loads each package's published sub-paths from packed tarballs in an empty project                                                                                             | `make clean-install`, `make clean-install-<pkg>` (CI, release workflow)          |
| `build/`      | `esm-marker.ts`                 | Writes `dist/esm/package.json` after an ESM build                                                                                                                             | `make/project.mk`, the build of each package                                     |
| `build/`      | `force-update.sh`               | Raises a package's `@venizia/*` dependencies to the registry's latest                                                                                                         | the `force-update` script of each package and of the wiki, `package-release.yml` |
| `build/`      | `build-checks/`                 | Tests of the built output: self-contained sourcemaps, the oxlint subpath loads no ESLint                                                                                      | `make build-checks` (CI, release workflow)                                       |

The wiki link and anchor gates (`make wiki-links-check`, `make wiki-anchors-check`) are VULCAN's, configured in the Makefile (`WIKI_REPO`, `WIKI_LINKS_FLAGS`); the anchor gate reads the build, so it needs `make docs` first.

The catalog check, the import-cycle list and the split report are `devz check catalog`, `devz check module-cycles` and `devz check split-report` (`packages/dev-configs/src/checks/`); `make catalog-check` and `make split-report` call them.

`make test-scripts` runs the `__tests__/` of `release/`, `preset/`, `checks/`, `build/` and `wiki/`.
`purity/__tests__` runs under `make purity-test` and `build/build-checks` under `make build-checks`,
because both need a build. `build/__tests__/` also holds the two tests of `packages/dev-configs`
(`BunCompiler` and `devz lint`): that package builds everything under its `src`, so its tests cannot
live there.
