# The dependency catalog gate and the package release dispatch.

.PHONY: catalog-check release-plan release

# Every catalogued dependency is referenced as "catalog:" (root workspaces.catalog), none drifted.
catalog-check:
	@bun scripts/check-catalog.ts

# Dispatches the release workflow one package at a time, in dependency order, waiting for each.
# `force-update` runs over the whole workspace, so overlapping runs fail on each other's ranges.
release-plan:
	@bun scripts/release.ts --dry-run

release:
	@bun scripts/release.ts $(ARGS)
