# Lint and format the packages, the wiki scripts and scripts/.

# Each project lints itself, from its own .configs/ and with its own tools (its node_modules/.bin).
# oxlint owns the rules, ESLint runs only naming-convention (oxlint has no port yet), bun fmt formats from the [fmt] table of the root bunfig.toml.
# Paths are ignored through .gitignore: `ignorePatterns` resolve against .configs/, not the project.
FMT_GLOB := "**/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}"
BUN_FMT_FLAGS := --no-script
# $(1) project dir; $(2) what oxlint and ESLint lint (default .); $(3) what bun fmt checks.
LINT_PROJECT = cd $(1) && node_modules/.bin/oxlint -c .configs/lints/oxlint.config.mts --deny-warnings $(or $(2),.) && node_modules/.bin/eslint -c .configs/lints/eslint.config.mjs $(or $(2),.) && bun fmt $(BUN_FMT_FLAGS) --check $(or $(3),$(FMT_GLOB))

LINT_PKG_TARGETS := $(addprefix lint-,$(PACKAGES))
LINT_FIX_PKG_TARGETS := $(addprefix lint-fix-,$(PACKAGES))

.PHONY: lint lint-all lint-fix lint-packages lint-wiki lint-scripts lint-files lint-fix-packages fmt-files \
        $(LINT_PKG_TARGETS) $(LINT_FIX_PKG_TARGETS)

lint: lint-packages
	@echo "✅ Linting completed."

lint-all: lint-packages lint-scripts lint-files lint-wiki
	@echo "✅ All linting completed."

lint-packages: $(LINT_PKG_TARGETS)

lint-fix: lint-fix-packages fmt-files

lint-fix-packages: $(LINT_FIX_PKG_TARGETS)

# Static pattern rules: make skips implicit-rule search for .PHONY targets, so a plain `lint-%`
# would never match. The release workflow calls `make lint-<package dir>`.
$(LINT_PKG_TARGETS): lint-%:
	@echo "🔍 Linting packages/$*..."
	@$(MAKE) --no-print-directory -C packages/$* lint

$(LINT_FIX_PKG_TARGETS): lint-fix-%:
	@$(MAKE) --no-print-directory -C packages/$* lint-fix

# site/ is the VitePress theme, written to its API (a `Layout` render method), so only the wiki's
# own scripts are linted; the formatter also covers its CSS, Vue and JSON. The sidebar config (.vitepress/config.mts) keeps its one-entry-per-line
# layout, so formatting skips it.
# A variable, not inline: the comma in {ts,js} would split the $(call) arguments.
WIKI_FMT_GLOB := "**/*.{ts,js,json,css,html,vue}" "scripts/*.mts"
lint-wiki:
	@echo "🔍 Linting docs/wiki..."
	@$(call LINT_PROJECT,docs/wiki,scripts,$(WIKI_FMT_GLOB))

# Files no project target reaches: the root package.json, the workflows, .agents, .configs, the preset
# templates and the examples
# (formatting only; an example keeps its own lint, typecheck and test scripts). drizzle-kit rewrites the
# migration snapshots, and openapi-typescript writes rpc-client-app's schema.d.ts, on their own.
FILES_GLOB := package.json "{.github,.agents,.configs,presets,examples}/**/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}"
FILES_IGNORE := --ignore-pattern "examples/*/migration/meta/**" --ignore-pattern "examples/rpc-client-app/src/api/schema.d.ts"

lint-files:
	@echo "🔍 Linting package.json, .github, .agents, .configs, presets and examples..."
	@bun fmt $(BUN_FMT_FLAGS) --check $(FILES_GLOB) $(FILES_IGNORE)

fmt-files:
	@bun fmt $(BUN_FMT_FLAGS) $(FILES_GLOB) $(FILES_IGNORE)

# `scripts/` is not a workspace member: it formats from the root bunfig.toml too.
lint-scripts:
	@echo "🔍 Linting scripts/..."
	@bun fmt $(BUN_FMT_FLAGS) --check "scripts/**/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}"
	@bun check --no-pretty -p scripts/tsconfig.json
