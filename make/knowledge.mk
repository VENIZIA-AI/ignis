# The IGNIS-only knowledge gates. okf-*, surface-*, symbols-*, releases-*, agent-setup and the wiki gates
# (wiki-links-check, wiki-anchors-check; the anchor gate reads the build, so `docs` runs first in build-all)
# come from VULCAN (node_modules/@venizia/vulcan/base/make/vulcan.mk, included by the Makefile).

.PHONY: split-report

split-report:
	@$(DEVZ) check split-report --dist dist/esm
