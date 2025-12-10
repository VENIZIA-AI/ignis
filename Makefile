.PHONY: all build build-all core dev-configs docs mcp-server helpers inversion docs-dev mcp-dev help

DEFAULT_GOAL := help

all: build

# Main build target which orchestrates all sub-packages
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

# Development tasks
docs-dev:
	@echo "🌐 Starting docs development server..."
	@bun run docs:dev

mcp-dev:
	@echo "🌐 Starting MCP development server..."
	@bun run mcp:dev

# Self-documentation
help:
	@echo "Makefile for the @venizia/lib Monorepo"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Main Targets:"
	@echo "  build         - Rebuilds all packages. Alias for 'build-all'."
	@echo "  build-all     - Rebuilds all packages in the correct order."
	@echo "  all           - Alias for 'build'."
	@echo ""
	@echo "Development:"
	@echo "  docs-dev      - Starts the documentation site in development mode."
	@echo "  mcp-dev       - Starts the MCP server in development mode."
	@echo ""
	@echo "Individual Package Builds:"
	@echo "  core          - Rebuilds the core @venizia/ignis package (after its dependencies)."
	@echo "  dev-configs   - Rebuilds the @venizia/dev-configs package."
	@echo "  docs          - Rebuilds the @venizia/ignis-docs package."
	@echo "  mcp-server    - Rebuilds the MCP docs server."
	@echo "  helpers       - Rebuilds the @venizia/ignis-helpers package."
	@echo "  inversion     - Rebuilds the @venizia/ignis-inversion package."
	@echo ""
	@echo "Other:"
	@echo "  help          - Shows this help message."