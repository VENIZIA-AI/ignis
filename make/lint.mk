# Lint and format the packages, the wiki scripts and scripts/.

# Each project lints itself, from its own .configs/ and with its own tools (its node_modules/.bin).
# oxlint owns the rules, ESLint runs only naming-convention (oxlint has no port yet), oxfmt formats.
# Paths are ignored through .gitignore: `ignorePatterns` resolve against .configs/, not the project.
FMT_GLOB := "**/*.{ts,mts,tsx,js,mjs}"
# $(1) project dir; $(2) what oxlint and ESLint lint (default .); $(3) what oxfmt checks.
LINT_PROJECT = cd $(1) && node_modules/.bin/oxlint -c .configs/oxlint.config.mts --deny-warnings $(or $(2),.) && node_modules/.bin/eslint -c .configs/eslint.config.mjs $(or $(2),.) && node_modules/.bin/oxfmt -c .configs/oxfmt.config.mts --check $(or $(3),$(FMT_GLOB))

LINT_PKG_TARGETS := $(addprefix lint-,$(PACKAGES))
FMT_PKG_TARGETS := $(addprefix fmt-,$(PACKAGES))

.PHONY: lint lint-all lint-packages lint-wiki lint-scripts fmt fmt-packages \
        $(LINT_PKG_TARGETS) $(FMT_PKG_TARGETS)

lint: lint-packages
	@echo "✅ Linting completed."

# lint-packages covers atlas too: the release workflow lints it, so leaving it out of `all` hides a
# failure until release time.
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

# `scripts/` is not a workspace member: its config and oxfmt resolve from the root package.json.
lint-scripts:
	@echo "🔍 Linting scripts/..."
	@node_modules/.bin/oxfmt -c scripts/.configs/oxfmt.config.mts --check "scripts/**/*.{ts,mts,js,mjs}"
	@node_modules/.bin/tsc -p scripts/tsconfig.json
