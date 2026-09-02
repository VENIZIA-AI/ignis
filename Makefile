.PHONY: all build build-all release release-plan core core-server connectors core-worker dev-configs docs docs-mcp filter helpers inversion boot kernel \
        help install clean setup-hooks agent-setup \
        lint lint-all lint-packages lint-examples artifacts-check \
        lint-dev-configs lint-inversion lint-filter lint-helpers lint-boot lint-core lint-core-server lint-kernel lint-connectors lint-core-worker lint-docs-mcp \
        purity purity-test purity-inversion purity-filter purity-helpers purity-kernel \
        purity-dev-configs purity-boot purity-core purity-core-server purity-connectors purity-core-worker purity-docs-mcp \
        okf-check okf-gen okf-coverage okf-viz split-report \
        catalog-check \
        update update-all update-core update-core-server update-dev-configs update-docs-mcp update-filter update-helpers update-inversion update-boot

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

split-report:
	@bun scripts/split-report.ts

agent-setup:
	@bun .agents/plugin/setup.ts

# ----------------------------------------------------------------------------
# DEPENDENCY CATALOG (root workspaces.catalog)
# ----------------------------------------------------------------------------
catalog-check:
	@bun scripts/check-catalog.ts

# Dispatches the release workflow one package at a time, in dependency order, waiting for each.
# `force-update` runs over the whole workspace, so overlapping runs fail on each other's ranges.
release-plan:
	@bun scripts/release.ts --dry-run

release:
	@bun scripts/release.ts $(ARGS)

# ----------------------------------------------------------------------------
# BUILD TARGETS
# ----------------------------------------------------------------------------
build: build-all

build-all: core core-worker docs docs-mcp
	@echo "🚀 All packages rebuilt successfully."

# Granular build targets for individual packages
# Dependency chain: dev-configs → inversion → {filter, helpers} → {boot, kernel} → connectors → core
# `filter` is isomorphic and depends on inversion only - it deliberately does NOT sit after helpers.
# `kernel` is the browser-pure tree (DI container, base classes, REST controllers, auth seam) -
# it sits beside `boot`, not after it, so it never depends on boot's node-only glob discovery.
# `core-worker` is the browser Worker host (envelope, transport, WorkerApplication) - it depends on
# kernel only, sits beside `connectors`, and never on `core`.
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

kernel: helpers filter
	@echo "📦 Rebuilding @venizia/ignis-kernel..."
	@bun run --filter "@venizia/ignis-kernel" rebuild

connectors: kernel
	@echo "📦 Rebuilding @venizia/ignis-connectors..."
	@bun run --filter "@venizia/ignis-connectors" rebuild

core-worker: kernel
	@echo "📦 Rebuilding @venizia/ignis-worker..."
	@bun run --filter "@venizia/ignis-worker" rebuild

core-server: boot connectors
	@echo "📦 Rebuilding @venizia/ignis (core-server)..."
	@bun run --filter "@venizia/ignis" rebuild

# `core` is the historical name for this target and stays an alias - it is in muscle memory, in the
# wiki, and in scripts outside this repository.
core: core-server

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

update-core-server:
	@echo "🔄 Force updating @venizia/ignis (core-server)..."
	@bun run --filter "@venizia/ignis" force-update

update-core: update-core-server

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

update-kernel:
	@echo "🔄 Force updating @venizia/ignis-kernel..."
	@bun run --filter "@venizia/ignis-kernel" force-update


# ----------------------------------------------------------------------------
# LINT TARGETS
# ----------------------------------------------------------------------------
lint: lint-packages
	@echo "✅ Linting completed."

# Includes lint-docs-mcp: the release workflow lints it, so leaving it out of `all` hides a failure
# until release time.
lint-all: lint-packages lint-examples lint-docs-mcp
	@echo "✅ All linting completed."

lint-packages:
	@echo "🔍 Linting all packages..."
	@bun run --filter "./packages/*" lint

lint-examples: artifacts-check
	@echo "🔍 Linting all examples..."
	@bun run --filter "./examples/*" lint

# The generated artifact index must match the decorated classes on disk; a stale index registers
# yesterday's classes and passes every other gate.
artifacts-check:
	@echo "🔍 Checking generated artifact indexes..."
	@bun run --filter "./examples/vert" check:artifacts

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

lint-core-server:
	@echo "🔍 Linting @venizia/ignis (core-server)..."
	@bun run --filter "@venizia/ignis" lint

lint-core: lint-core-server

lint-kernel:
	@echo "🔍 Linting @venizia/ignis-kernel..."
	@bun run --filter "@venizia/ignis-kernel" lint

lint-connectors:
	@echo "🔍 Linting @venizia/ignis-connectors..."
	@bun run --filter "@venizia/ignis-connectors" lint

lint-core-worker:
	@echo "🔍 Linting @venizia/ignis-worker..."
	@bun run --filter "@venizia/ignis-worker" lint

lint-docs-mcp:
	@echo "🔍 Linting @venizia/ignis-docs (MCP Server)..."
	@bun run --filter "@venizia/ignis-docs" lint

# ----------------------------------------------------------------------------
# PURITY TARGETS
# Bundles each entry claimed browser-pure and fails on node builtins or globals.
# Requires the package's dist - run the matching build target first.
# ----------------------------------------------------------------------------
purity:
	@echo "🔍 Checking browser purity for all claimed entries..."
	@bun scripts/purity/cli.ts

# The probe's own regression tests. They live outside every package, so `cd packages/<x> && bun test`
# never discovers them - without this target nothing runs the tests that guard the CI gate.
purity-test:
	@echo "🔍 Running the purity probe's regression tests..."
	@bun test scripts/purity/__tests__

purity-inversion:
	@echo "🔍 Checking browser purity for @venizia/ignis-inversion..."
	@bun scripts/purity/cli.ts inversion

purity-filter:
	@echo "🔍 Checking browser purity for @venizia/ignis-filter..."
	@bun scripts/purity/cli.ts filter

purity-helpers:
	@echo "🔍 Checking browser purity for @venizia/ignis-helpers..."
	@bun scripts/purity/cli.ts helpers

purity-kernel:
	@echo "🔍 Checking browser purity for @venizia/ignis-kernel..."
	@bun scripts/purity/cli.ts kernel

purity-connectors:
	@echo "🔍 Checking browser purity for @venizia/ignis-connectors..."
	@bun scripts/purity/cli.ts connectors

purity-core-worker:
	@echo "🔍 Checking browser purity for @venizia/ignis-worker..."
	@bun scripts/purity/cli.ts core-worker

purity-dev-configs purity-boot purity-core purity-core-server purity-docs-mcp:
	@echo "ℹ️  No browser-pure entry claimed for this package - skipping."

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
	@echo "  lint-examples     - Lint examples/ directory only (runs artifacts-check first)."
	@echo "  artifacts-check   - Verify generated artifact indexes are fresh (examples/vert)."
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
	@echo "  split-report  - Report hub files, stray types, missing barrels, long files, cycles (informational)."
	@echo "  agent-setup   - Link your agent's tool file + skills to the tracked AGENTS.md."
	@echo ""
	@echo "Browser purity:"
	@echo "  purity        - Gate: every entry claimed browser-pure has no node builtin or global."
	@echo "  purity-test   - Run the purity probe's own regression tests."
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
