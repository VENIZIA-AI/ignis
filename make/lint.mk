# Lint and format the packages, the wiki scripts and scripts/.

# Each project lints itself, from its own .configs/ and with its own tools (its node_modules/.bin).
# oxlint owns the rules, ESLint runs only naming-convention (oxlint has no port yet), bun fmt formats from the [fmt] table of the root bunfig.toml.
# Paths are ignored through .gitignore: `ignorePatterns` resolve against .configs/, not the project.
FMT_GLOB := "**/*.{ts,mts,tsx,js,mjs}"
BUN_FMT_FLAGS := --no-script
# $(1) project dir; $(2) what oxlint and ESLint lint (default .); $(3) what bun fmt checks.
LINT_PROJECT = cd $(1) && node_modules/.bin/oxlint -c .configs/lints/oxlint.config.mts --deny-warnings $(or $(2),.) && node_modules/.bin/eslint -c .configs/lints/eslint.config.mjs $(or $(2),.) && bun fmt $(BUN_FMT_FLAGS) --check $(or $(3),$(FMT_GLOB))

LINT_PKG_TARGETS := $(addprefix lint-,$(PACKAGES))
FMT_PKG_TARGETS := $(addprefix fmt-,$(PACKAGES))

.PHONY: lint lint-all lint-packages lint-wiki lint-scripts fmt fmt-packages \
        $(LINT_PKG_TARGETS) $(FMT_PKG_TARGETS)

lint: lint-packages
	@echo "✅ Linting completed."

lint-all: lint-packages lint-scripts
	@echo "✅ All linting completed."

lint-packages: $(LINT_PKG_TARGETS)

fmt: fmt-packages

fmt-packages: $(FMT_PKG_TARGETS)

# Static pattern rules: make skips implicit-rule search for .PHONY targets, so a plain `lint-%`
# would never match. The release workflow calls `make lint-<package dir>`.
$(LINT_PKG_TARGETS): lint-%:
	@echo "🔍 Linting packages/$*..."
	@$(MAKE) --no-print-directory -C packages/$* lint

$(FMT_PKG_TARGETS): fmt-%:
	@$(MAKE) --no-print-directory -C packages/$* fmt

# site/ is the VitePress theme, written to its API (a `Layout` render method), so only the wiki's
# own scripts are linted. The sidebar config (.vitepress/config.mts) keeps its one-entry-per-line
# layout, so formatting skips it, as Prettier's `*.{js,ts}` glob did.
# A variable, not inline: the comma in {ts,js} would split the $(call) arguments.
WIKI_FMT_GLOB := "**/*.{ts,js}" "scripts/*.mts"
lint-wiki:
	@echo "🔍 Linting docs/wiki..."
	@$(call LINT_PROJECT,docs/wiki,scripts,$(WIKI_FMT_GLOB))

# `scripts/` is not a workspace member: it formats from the root bunfig.toml too.
lint-scripts:
	@echo "🔍 Linting scripts/..."
	@bun fmt $(BUN_FMT_FLAGS) --check "scripts/**/*.{ts,mts,js,mjs}"
	@bun check --no-pretty -p scripts/tsconfig.json
