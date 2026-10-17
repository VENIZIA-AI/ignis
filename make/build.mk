# Install, clean, git hooks, the package build order, the wiki build, and the force-update targets.

UPDATE_TARGETS := $(addprefix update-,$(PACKAGES))

.PHONY: install clean setup-hooks build build-all docs update update-all $(PACKAGES) $(UPDATE_TARGETS)

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

build-all: core core-worker boot docs surface-check wiki-links-check wiki-anchors-check
	@echo "🚀 All packages rebuilt successfully."

# `make <pkg>` rebuilds one package after its dependencies. The graph:
# dev-configs → inversion → {filter, helpers} → kernel → connectors → core-server.
# `boot` hangs off helpers and is consumed by applications only (the `ignis-artifacts` generator) -
# core does not depend on it, so `build-all` names it explicitly.
# `filter` is isomorphic and depends on inversion only - it deliberately does NOT sit after helpers.
# `kernel` is the browser-pure tree (DI container, base classes, REST controllers, auth seam) -
# it sits beside `boot`, not after it, so it never depends on boot's node-only glob discovery.
# `core-worker` is the browser Worker host (envelope, transport, WorkerApplication) - it depends on
# kernel only, sits beside `connectors`, and never on `core`.
inversion: dev-configs
filter helpers: inversion
boot: helpers
kernel: helpers filter
connectors core-worker: kernel
core-server: connectors

# Each package builds through its own Makefile (make/project.mk); this file only orders them.
$(PACKAGES):
	@echo ""
	@echo "📦 Rebuilding $(call PKG_NAME,$@)..."
	@$(MAKE) --no-print-directory -C packages/$@ rebuild

docs:
	@echo "📦 Rebuilding wiki (VitePress)..."
	@bun run --filter "@venizia/ignis-docs" docs:build

# ----------------------------------------------------------------------------
# FORCE UPDATE TARGETS (fetch latest from NPM registry)
# Note: 'bun install' triggers postinstall which runs force-update automatically
# ----------------------------------------------------------------------------
update: install

update-all: install

$(UPDATE_TARGETS): update-%:
	@echo "🔄 Force updating $(call PKG_NAME,$*)..."
	@bun run --filter "$(call PKG_NAME,$*)" force-update
