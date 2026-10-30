# The dependency catalog gate, the VULCAN preset, and the package release dispatch.

.PHONY: catalog-check preset-build preset-smoke release-plan release

# Every catalogued dependency is referenced as "catalog:" (root workspaces.catalog), none drifted.
catalog-check:
	@$(DEVZ) check catalog --glob 'examples/*/package.json' --glob 'docs/*/package.json'

# Writes packages/core-server/dist/presets from the template, with this workspace's versions.
# Run it after core-server builds: the build empties dist.
preset-build:
	@bun scripts/preset/vulcan-preset.ts

# Creates an app from the packed preset in a temp folder and runs its checks. Needs a build.
# VULCAN_CMD (default: bun x @venizia/vulcan@<the version in package.json devDependencies>) and VULCAN_TGZ (comma-separated packed VULCAN
# tarballs) are read by the script.
preset-smoke:
	@bun scripts/preset/preset-smoke.ts

# `release-plan` prints the plan and dispatches nothing. `release` plans and dispatches the workflow ONCE for the whole plan:
# the run releases the packages in dependency order. ARGS="--plan <printed plan> --yes" sends a plan as printed,
# to continue a run that stopped.
release-plan:
	@bun scripts/release/release.ts --dry-run

release:
	@bun scripts/release/release.ts $(ARGS)
