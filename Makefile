.PHONY: all build build-all core dev-configs docs docs-mcp filter helpers inversion boot \
        help install clean setup-hooks agent-setup \
        lint lint-all lint-packages lint-examples \
        lint-dev-configs lint-inversion lint-filter lint-helpers lint-boot lint-core lint-docs-mcp \
        purity purity-inversion purity-filter purity-helpers purity-core \
        okf-check okf-gen okf-coverage okf-viz \
        catalog-check \
        update update-all update-core update-dev-configs update-docs-mcp update-filter update-helpers update-inversion update-boot

DEFAULT_GOAL := help

all: build

# ----------------------------------------------------------------------------
# INSTALL & CLEAN
# ----------------------------------------------------------------------------
install:
	@echo "📥 Installing dependencies (with force-update via postinstall)..."
	@bun install
	@echo "✅ Install completed."

clean:
	@echo "🧹 Cleaning all packages..."
	@bun run --filter "*" clean

# ----------------------------------------------------------------------------
# GIT HOOKS
# ----------------------------------------------------------------------------
setup-hooks:
	@echo "🔧 Setting up git hooks..."
	@git config core.hooksPath .githooks
	@echo "✅ Git hooks configured to use .githooks directory."

# ----------------------------------------------------------------------------
# KNOWLEDGE BUNDLE (.agents/knowledge)
# ----------------------------------------------------------------------------
okf-check:
	@bun .agents/knowledge-tools/okf.ts check

okf-gen:
	@bun .agents/knowledge-tools/okf.ts gen

okf-coverage:
	@bun .agents/knowledge-tools/okf.ts coverage

okf-viz:
	@bun .agents/knowledge-tools/okf.ts viz

agent-setup:
	@bun .agents/plugin/setup.ts

# ----------------------------------------------------------------------------
# DEPENDENCY CATALOG (root workspaces.catalog)
# ----------------------------------------------------------------------------
catalog-check:
	@bun scripts/check-catalog.ts

# ----------------------------------------------------------------------------
# BUILD TARGETS
# ----------------------------------------------------------------------------
build: build-all

build-all: core docs docs-mcp
	@echo "🚀 All packages rebuilt successfully."

# Granular build targets for individual packages
# Dependency chain: dev-configs → inversion → {filter, helpers} → boot → core
# `filter` is isomorphic and depends on inversion only - it deliberately does NOT sit after helpers.
# Note: Using --filter directly to avoid triggering prerebuild scripts (Make handles deps)
dev-configs:
	@echo "📦 Rebuilding @venizia/dev-configs..."
	@bun run --filter "@venizia/dev-configs" rebuild

inversion: dev-configs
	@echo "📦 Rebuilding @venizia/ignis-inversion..."
	@bun run --filter "@venizia/ignis-inversion" rebuild

filter: inversion
	@echo "📦 Rebuilding @venizia/ignis-filter..."
	@bun run --filter "@venizia/ignis-filter" rebuild

helpers: inversion
	@echo "📦 Rebuilding @venizia/ignis-helpers..."
	@bun run --filter "@venizia/ignis-helpers" rebuild

boot: helpers
	@echo "📦 Rebuilding @venizia/ignis-boot..."
	@bun run --filter "@venizia/ignis-boot" rebuild

core: boot filter
	@echo "📦 Rebuilding @venizia/ignis (core)..."
	@bun run --filter "@venizia/ignis" rebuild

docs:
	@echo "📦 Rebuilding wiki (VitePress)..."
	@bun run --filter "@venizia/ignis-docs" docs:build

docs-mcp: dev-configs
	@echo "📦 Rebuilding @venizia/ignis-docs (MCP Server)..."
	@bun run --filter "@venizia/ignis-docs" mcp:rebuild

# ----------------------------------------------------------------------------
# FORCE UPDATE TARGETS (fetch latest from NPM registry)
# Note: 'bun install' triggers postinstall which runs force-update automatically
# ----------------------------------------------------------------------------
update: install

update-all: install

update-core:
	@echo "🔄 Force updating @venizia/ignis (core)..."
	@bun run --filter "@venizia/ignis" force-update

update-dev-configs:
	@echo "🔄 Force updating @venizia/dev-configs..."
	@bun run --filter "@venizia/dev-configs" force-update

update-docs-mcp:
	@echo "🔄 Force updating @venizia/ignis-docs (MCP Server)..."
	@bun run --filter "@venizia/ignis-docs" force-update

update-helpers:
	@echo "🔄 Force updating @venizia/ignis-helpers..."
	@bun run --filter "@venizia/ignis-helpers" force-update

update-inversion:
	@echo "🔄 Force updating @venizia/ignis-inversion..."
	@bun run --filter "@venizia/ignis-inversion" force-update

update-filter:
	@echo "🔄 Force updating @venizia/ignis-filter..."
	@bun run --filter "@venizia/ignis-filter" force-update

update-boot:
	@echo "🔄 Force updating @venizia/ignis-boot..."
	@bun run --filter "@venizia/ignis-boot" force-update

# ----------------------------------------------------------------------------
# BROWSER PURITY GATES
# ----------------------------------------------------------------------------
purity: purity-inversion purity-filter purity-helpers purity-core
	@echo "✅ Browser purity gates passed."

purity-inversion:
	@echo "🌐 Browser purity: @venizia/ignis-inversion..."
	@bun run --filter "@venizia/ignis-inversion" purity

# filter's gate resolves @venizia/ignis-inversion through its exports map, which points at dist/ - it measures what inversion SHIPS, not what its source says. Without this dependency a stale dist reports a false PASS.
purity-filter: inversion
	@echo "🌐 Browser purity: @venizia/ignis-filter..."
	@bun run --filter "@venizia/ignis-filter" purity

# helpers reaches @venizia/ignis-inversion through its exports map, which points at dist/ - this gate measures what inversion SHIPS, not what its source says. Without this dependency a stale dist reports a false PASS.
purity-helpers: inversion
	@echo "🌐 Browser purity: @venizia/ignis-helpers (BaseHelper path)..."
	@bun run --filter "@venizia/ignis-helpers" purity

# core reaches @venizia/ignis-helpers and @venizia/ignis-inversion through their exports maps, which point at dist/ - this gate measures what those packages SHIP, not what their source says. `core` builds the whole chain, so it is the prerequisite that keeps every dist/ this gate depends on fresh.
purity-core: core
	@echo "🌐 Browser purity: @venizia/ignis (core repositories path)..."
	@bun run --filter "@venizia/ignis" purity

# ----------------------------------------------------------------------------
# LINT TARGETS
# ----------------------------------------------------------------------------
lint: lint-packages
	@echo "✅ Linting completed."

lint-all: lint-packages lint-examples
	@echo "✅ All linting completed."

lint-packages:
	@echo "🔍 Linting all packages..."
	@bun run --filter "./packages/*" lint

lint-examples:
	@echo "🔍 Linting all examples..."
	@bun run --filter "./examples/*" lint

lint-dev-configs:
	@echo "🔍 Linting @venizia/dev-configs..."
	@bun run --filter "@venizia/dev-configs" lint

lint-inversion:
	@echo "🔍 Linting @venizia/ignis-inversion..."
	@bun run --filter "@venizia/ignis-inversion" lint

lint-filter:
	@echo "🔍 Linting @venizia/ignis-filter..."
	@bun run --filter "@venizia/ignis-filter" lint

lint-helpers:
	@echo "🔍 Linting @venizia/ignis-helpers..."
	@bun run --filter "@venizia/ignis-helpers" lint

lint-boot:
	@echo "🔍 Linting @venizia/ignis-boot..."
	@bun run --filter "@venizia/ignis-boot" lint

lint-core:
	@echo "🔍 Linting @venizia/ignis (core)..."
	@bun run --filter "@venizia/ignis" lint

lint-docs-mcp:
	@echo "🔍 Linting @venizia/ignis-docs (MCP Server)..."
	@bun run --filter "@venizia/ignis-docs" lint

# ----------------------------------------------------------------------------
# HELP
# ----------------------------------------------------------------------------
help:
	@echo "Makefile for the @venizia/lib Monorepo"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Main Targets:"
	@echo "  all           - Alias for 'build'."
	@echo "  build         - Rebuilds all packages (alias for 'build-all')."
	@echo "  build-all     - Rebuilds all packages in the correct order."
	@echo "  install       - Install all dependencies with bun."
	@echo "  clean         - Clean build artifacts from all packages."
	@echo "  setup-hooks   - Configure git to use .githooks directory."
	@echo ""
	@echo "Force Update (fetch latest from NPM):"
	@echo "  update            - Force update all packages from NPM registry."
	@echo "  update-all        - Same as 'update'."
	@echo "  update-core       - Force update @venizia/ignis (core) dependencies."
	@echo "  update-dev-configs- Force update @venizia/dev-configs dependencies."
	@echo "  update-docs-mcp   - Force update @venizia/ignis-docs (MCP) dependencies."
	@echo "  update-helpers    - Force update @venizia/ignis-helpers dependencies."
	@echo "  update-inversion  - Force update @venizia/ignis-inversion dependencies."
	@echo "  update-boot       - Force update @venizia/ignis-boot dependencies."
	@echo ""
	@echo "Individual Package Builds:"
	@echo "  core          - Rebuilds @venizia/ignis (after its dependencies)."
	@echo "  boot          - Rebuilds @venizia/ignis-boot (after its dependencies)."
	@echo "  dev-configs   - Rebuilds @venizia/dev-configs."
	@echo "  docs          - Rebuilds wiki (VitePress) for GitHub Pages."
	@echo "  docs-mcp      - Rebuilds @venizia/ignis-docs (MCP Server) for NPM."
	@echo "  helpers       - Rebuilds @venizia/ignis-helpers."
	@echo "  inversion     - Rebuilds @venizia/ignis-inversion."
	@echo ""
	@echo "Linting:"
	@echo "  lint              - Lint all packages (alias for lint-packages)."
	@echo "  lint-all          - Lint all packages AND examples."
	@echo "  lint-packages     - Lint packages/ directory only."
	@echo "  lint-examples     - Lint examples/ directory only."
	@echo "  lint-dev-configs  - Lint @venizia/dev-configs."
	@echo "  lint-inversion    - Lint @venizia/ignis-inversion."
	@echo "  lint-helpers      - Lint @venizia/ignis-helpers."
	@echo "  lint-boot         - Lint @venizia/ignis-boot."
	@echo "  lint-core         - Lint @venizia/ignis (core)."
	@echo "  lint-docs-mcp     - Lint @venizia/ignis-docs (MCP Server)."
	@echo ""
	@echo "Knowledge bundle (.agents/knowledge):"
	@echo "  okf-check     - Gate: frontmatter, links, coverage, freshness (runs in pre-commit)."
	@echo "  okf-gen       - Regenerate source-derived reference content."
	@echo "  okf-coverage  - Report bundle coverage against the source inventory."
	@echo "  okf-viz       - Build the offline knowledge-graph explorer."
	@echo "  agent-setup   - Link your agent's tool file + skills to the tracked AGENTS.md."
	@echo ""
	@echo "Dependencies:"
	@echo "  catalog-check - Gate: every catalogued dep is referenced as \"catalog:\", none drifted."
	@echo ""
	@echo "Other:"
	@echo "  help          - Show this help message."
	@echo ""
	@echo "Development (use bun run directly):"
	@echo "  bun run docs:dev  - Start documentation site in development mode."
	@echo "  bun run mcp:dev   - Start MCP server in development mode."
