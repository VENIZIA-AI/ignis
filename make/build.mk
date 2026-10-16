# Install, clean, git hooks, the package build order, the wiki build, and the force-update targets.

.PHONY: install clean setup-hooks build build-all core core-server connectors core-worker dev-configs docs \
        filter helpers inversion boot atlas kernel \
        update update-all update-core update-core-server update-dev-configs update-atlas update-filter \
        update-helpers update-inversion update-boot

# ----------------------------------------------------------------------------
# INSTALL & CLEAN
# ----------------------------------------------------------------------------
install:
	@echo "📥 Installing dependencies (with force-update via postinstall)..."
	@bun install
	@echo "✅ Install completed."

clean:
	@echo "🧹 Cleaning all packages..."
	@$(foreach p,$(PACKAGES),$(MAKE) --no-print-directory -C packages/$(p) clean &&) true
	@bun run --filter "*" clean

# ----------------------------------------------------------------------------
# GIT HOOKS
# ----------------------------------------------------------------------------
setup-hooks:
	@echo "🔧 Setting up git hooks..."
	@git config core.hooksPath .githooks
	@echo "✅ Git hooks configured to use .githooks directory."

# ----------------------------------------------------------------------------
# BUILD TARGETS
# ----------------------------------------------------------------------------
build: build-all

build-all: core core-worker boot atlas docs surface-check symbols-check wiki-links-check wiki-anchors-check
	@echo "🚀 All packages rebuilt successfully."

# Granular build targets for individual packages
# Dependency chain: dev-configs → inversion → {filter, helpers} → kernel → connectors → core.
# `boot` hangs off helpers and is consumed by applications only (the `ignis-artifacts` generator) -
# core does not depend on it, so `build-all` names it explicitly.
# `filter` is isomorphic and depends on inversion only - it deliberately does NOT sit after helpers.
# `kernel` is the browser-pure tree (DI container, base classes, REST controllers, auth seam) -
# it sits beside `boot`, not after it, so it never depends on boot's node-only glob discovery.
# `core-worker` is the browser Worker host (envelope, transport, WorkerApplication) - it depends on
# kernel only, sits beside `connectors`, and never on `core`.
# Each package builds through its own Makefile (make/project.mk); this file only orders them.
dev-configs:
	@echo ""
	@echo "📦 Rebuilding @venizia/dev-configs..."
	@$(MAKE) --no-print-directory -C packages/dev-configs rebuild

inversion: dev-configs
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-inversion..."
	@$(MAKE) --no-print-directory -C packages/inversion rebuild

filter: inversion
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-filter..."
	@$(MAKE) --no-print-directory -C packages/filter rebuild

helpers: inversion
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-helpers..."
	@$(MAKE) --no-print-directory -C packages/helpers rebuild

boot: helpers
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-boot..."
	@$(MAKE) --no-print-directory -C packages/boot rebuild

# `atlas` depends on helpers (transitively rebuilding dev-configs and inversion) and is consumed by
# neither core nor examples - `build-all` names it explicitly, the same reason `boot` is above.
atlas: helpers
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-atlas..."
	@$(MAKE) --no-print-directory -C packages/atlas rebuild

kernel: helpers filter
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-kernel..."
	@$(MAKE) --no-print-directory -C packages/kernel rebuild

connectors: kernel
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-connectors..."
	@$(MAKE) --no-print-directory -C packages/connectors rebuild

core-worker: kernel
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis-worker..."
	@$(MAKE) --no-print-directory -C packages/core-worker rebuild

core-server: connectors
	@echo ""
	@echo "📦 Rebuilding @venizia/ignis (core-server)..."
	@$(MAKE) --no-print-directory -C packages/core-server rebuild

# `core` is the historical name for this target and stays an alias - it is in muscle memory, in the
# wiki, and in scripts outside this repository.
core: core-server

docs:
	@echo "📦 Rebuilding wiki (VitePress)..."
	@bun run --filter "@venizia/ignis-docs" docs:build

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

update-atlas:
	@echo "🔄 Force updating @venizia/ignis-atlas..."
	@bun run --filter "@venizia/ignis-atlas" force-update

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
