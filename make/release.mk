# The dependency catalog gate, the VULCAN preset, and the package release dispatch.

.PHONY: catalog-check preset-build preset-smoke release-plan release

# Every catalogued dependency is referenced as "catalog:" (root workspaces.catalog), none drifted.
catalog-check:
	@bun scripts/check-catalog.ts

# Writes packages/core-server/dist/vulcan-preset from the template, with this workspace's versions.
# Run it after core-server builds: the build empties dist.
preset-build:
	@bun scripts/vulcan-preset.ts

# Creates an app from the packed preset in a temp folder and runs its checks. Needs a build.
# VULCAN_CMD (default: bun x @venizia/vulcan@latest) and VULCAN_TGZ (comma-separated packed VULCAN
# tarballs) are read by the script.
preset-smoke:
	@bun scripts/preset-smoke.ts

# Dispatches the release workflow one package at a time, in dependency order, waiting for each.
# `force-update` runs over the whole workspace, so overlapping runs fail on each other's ranges.
release-plan:
	@bun scripts/release.ts --dry-run

release:
	@bun scripts/release.ts $(ARGS)
