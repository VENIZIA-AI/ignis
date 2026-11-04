# The IGNIS-only knowledge gates. okf-*, surface-*, symbols-*, releases-*, vulcan-sync and the wiki gates
# (wiki-links-check, wiki-anchors-check; the anchor gate reads the build, so `docs` runs first in build-all)
# come from VULCAN (node_modules/@venizia/vulcan/base/make/vulcan.mk, included by the Makefile).

.PHONY: split-report api-gen api-check api-undocumented

# The generated API reference (docs/wiki/content/references/api): one page per package entry, read from the built
# .d.ts. All three need a build (make build-all runs the two gates after it).
api-gen:
	@$(VULCAN) x atlas api gen

api-check:
	@$(VULCAN) x atlas api check

api-undocumented:
	@$(VULCAN) x atlas api undocumented

split-report:
	@$(DEVZ) check split-report --dist dist/esm
