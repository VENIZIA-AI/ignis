# The knowledge bundle (.agents/knowledge), the generated reference tables and the wiki link gates.

.PHONY: okf-check okf-gen okf-coverage okf-viz split-report surface-gen surface-check symbols-gen \
        symbols-check releases-gen releases-check wiki-links-check wiki-anchors-check agent-setup

okf-check:
	@bun .agents/knowledge-tools/okf.ts check

okf-gen:
	@bun .agents/knowledge-tools/okf.ts gen

okf-coverage:
	@bun .agents/knowledge-tools/okf.ts coverage

okf-viz:
	@bun .agents/knowledge-tools/okf.ts viz

split-report:
	@bun scripts/split-report.ts

# Reads the built .d.ts of every exports entry; run after `make build-all`.
surface-gen:
	@bun scripts/public-surface.ts gen

surface-check:
	@bun scripts/public-surface.ts check

# The Atlas `symbol` tool's table. Reads the same built .d.ts surface-gen does; run after a build.
symbols-gen:
	@bun scripts/atlas-symbols.ts gen

symbols-check:
	@bun scripts/atlas-symbols.ts check

# The Atlas `version` and `changes` tools' table. Reads `git log` and the changelogs, not `dist`.
releases-gen:
	@bun scripts/atlas-releases.ts gen

releases-check:
	@bun scripts/atlas-releases.ts check

wiki-links-check:
	@bun scripts/wiki-source-links.ts

# Dead `#fragment` links. Reads the emitted ids, so it needs a build - `docs` runs first in build-all.
wiki-anchors-check:
	@bun scripts/wiki-anchors.ts

agent-setup:
	@bun .agents/plugin/setup.ts
