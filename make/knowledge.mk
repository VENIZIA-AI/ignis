# The IGNIS-only knowledge and wiki gates. okf-*, surface-*, symbols-*, releases-* and agent-setup
# come from VULCAN (node_modules/@venizia/vulcan/base/make/vulcan.mk, included by the Makefile).

.PHONY: split-report wiki-links-check wiki-anchors-check

split-report:
	@bun scripts/checks/split-report.ts

wiki-links-check:
	@bun scripts/wiki/wiki-source-links.ts

# Dead `#fragment` links. Reads the emitted ids, so it needs a build - `docs` runs first in build-all.
wiki-anchors-check:
	@bun scripts/wiki/wiki-anchors.ts
