.PHONY: all build build-all core dev-configs docs mcp-server helpers inversion \
        docs-dev mcp-dev help install clean lint \
        update update-all update-core update-dev-configs update-docs update-helpers update-inversion

DEFAULT_GOAL := help

all: build

# ============================================================================
# INSTALL & CLEAN
# ============================================================================
install:
	@echo "📥 Installing dependencies (with force-update via postinstall)..."
	@bun install
	@echo "✅ Install completed."

clean:
	@echo "🧹 Cleaning all packages..."
	@bun run --filter "*" clean

# ============================================================================
# BUILD TARGETS
# ============================================================================
build: build-all

build-all: dev-configs core docs mcp-server
	@echo "🚀 All packages rebuilt successfully."

# Granular build targets for individual packages
# Note: 'core' depends on 'inversion' and 'helpers' to respect the prerebuild step
core: inversion helpers
	@echo "📦 Rebuilding @venizia/ignis (core)..."
	@bun run rebuild:core

dev-configs:
	@echo "📦 Rebuilding @venizia/dev-configs..."
	@bun run rebuild:dev-configs

docs:
	@echo "📦 Rebuilding @venizia/ignis-docs..."
	@bun run rebuild:docs

mcp-server:
	@echo "📦 Rebuilding MCP docs server..."
	@bun run rebuild:mcp-docs-server

helpers:
	@echo "📦 Rebuilding @venizia/ignis-helpers..."
	@bun run rebuild:helpers

inversion:
	@echo "📦 Rebuilding @venizia/ignis-inversion..."
	@bun run rebuild:inversion

# ============================================================================
# FORCE UPDATE TARGETS (fetch latest from NPM registry)
# Note: 'bun install' triggers postinstall which runs force-update automatically
# ============================================================================
update: install

update-all: install

update-core:
	@echo "🔄 Force updating @venizia/ignis (core)..."
	@bun run --filter "@venizia/ignis" force-update

update-dev-configs:
	@echo "🔄 Force updating @venizia/dev-configs..."
	@bun run --filter "@venizia/dev-configs" force-update

update-docs:
	@echo "🔄 Force updating @venizia/ignis-docs..."
	@bun run --filter "@venizia/ignis-docs" force-update

update-helpers:
	@echo "🔄 Force updating @venizia/ignis-helpers..."
	@bun run --filter "@venizia/ignis-helpers" force-update

update-inversion:
	@echo "🔄 Force updating @venizia/ignis-inversion..."
	@bun run --filter "@venizia/ignis-inversion" force-update

# ============================================================================
# LINT TARGETS
# ============================================================================
lint:
	@echo "🔍 Linting all packages..."
	@bun run --filter "*" lint

lint-dev-configs:
	@echo "🔍 Linting @venizia/dev-configs..."
	@bun run lint:dev-configs

# ============================================================================
# DEVELOPMENT TASKS
# ============================================================================
docs-dev:
	@echo "🌐 Starting docs development server..."
	@bun run docs:dev

mcp-dev:
	@echo "🌐 Starting MCP development server..."
	@bun run mcp:dev

# ============================================================================
# HELP
# ============================================================================
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
	@echo ""
	@echo "Force Update (fetch latest from NPM):"
	@echo "  update            - Force update all packages from NPM registry."
	@echo "  update-all        - Same as 'update'."
	@echo "  update-core       - Force update @venizia/ignis (core) dependencies."
	@echo "  update-dev-configs- Force update @venizia/dev-configs dependencies."
	@echo "  update-docs       - Force update @venizia/ignis-docs dependencies."
	@echo "  update-helpers    - Force update @venizia/ignis-helpers dependencies."
	@echo "  update-inversion  - Force update @venizia/ignis-inversion dependencies."
	@echo ""
	@echo "Individual Package Builds:"
	@echo "  core          - Rebuilds @venizia/ignis (after its dependencies)."
	@echo "  dev-configs   - Rebuilds @venizia/dev-configs."
	@echo "  docs          - Rebuilds @venizia/ignis-docs."
	@echo "  mcp-server    - Rebuilds the MCP docs server."
	@echo "  helpers       - Rebuilds @venizia/ignis-helpers."
	@echo "  inversion     - Rebuilds @venizia/ignis-inversion."
	@echo ""
	@echo "Linting:"
	@echo "  lint          - Lint all packages."
	@echo "  lint-dev-configs - Lint @venizia/dev-configs."
	@echo ""
	@echo "Development:"
	@echo "  docs-dev      - Start documentation site in development mode."
	@echo "  mcp-dev       - Start MCP server in development mode."
	@echo ""
	@echo "Other:"
	@echo "  help          - Show this help message."
