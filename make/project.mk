# The shared build and lint targets of one package. A package Makefile sets the variables below
# and includes this file.
#
#   FORMATS      cjs esm (default) | cjs | plain - which outputs `build` emits
#   CJS_TSCONFIG the program the CJS pass emits (default .configs/builders/tsconfig.build.json)
#   CJS_OUT      where the CJS pass lands (default dist/cjs); empty: the tsconfig's own outDir
#   POST_BUILD   a shell step only this package has, run after the emit
#
# Every tool comes from the package's node_modules/.bin, by absolute path: a recipe never depends on
# PATH (`sh ./scripts/build.sh` once died at `tsc-alias: not found` with CJS emitted and ESM stale).
# The one exception is bun itself, which runs every recipe. Type checking is `bun check` (same
# diagnostics as `tsc --noEmit`, a fraction of the time); tsc still emits the JS and the .d.ts.

BIN := $(CURDIR)/node_modules/.bin
# `--inlineSources` fills `sourcesContent` in every .js.map, so a bundler never looks for a `src/` the
# tarball lacks. Declaration maps stay as tsc writes them: atlas and editors map a .d.ts back to its
# source line through them, and no bundler loads them.
TSC := $(BIN)/tsc --inlineSources
TYPECHECK := bun check --no-pretty
TSC_ALIAS := $(BIN)/tsc-alias
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)

FORMATS ?= cjs esm
CJS_TSCONFIG ?= .configs/builders/tsconfig.build.json
CJS_OUT ?= dist/cjs
ESM_TSCONFIG := .configs/builders/tsconfig.esm.json

# The programs `build` emits, each type-checked before `rebuild` deletes dist: the ESM program swaps
# module/moduleResolution and can fail where the CJS one passed, and one that fails after clean
# leaves a dist with cjs/ and no esm/.
EMIT_TSCONFIGS := $(if $(filter cjs,$(FORMATS)),$(CJS_TSCONFIG)) $(if $(filter esm,$(FORMATS)),$(ESM_TSCONFIG))

FMT_GLOB := "**/*.{ts,mts,tsx,js,mjs}"
# bun fmt reads the project's oxfmt config; --no-script keeps a package.json "fmt" script from taking over.
BUN_FMT_FLAGS := --no-script --config .configs/formatters/oxfmt.config.mts

# Paths this package must not lint or format, relative to the package - generated files, bundles:
#   LINT_IGNORE := src/generated.ts dev-dist/** public/**
# Set it in the package Makefile before the include. `ignorePatterns` inside .configs/ cannot do this:
# they resolve against .configs/ and match nothing.
LINT_IGNORE ?=
LINT_IGNORE_FLAGS = $(foreach glob,$(LINT_IGNORE),--ignore-pattern "$(glob)")

.PHONY: build typecheck clean rebuild lint fmt

# tsconfig.json covers the tests too, so a broken test fails here, before anything is emitted.
typecheck:
	@$(TYPECHECK) -p tsconfig.json
	@for config in $(filter-out tsconfig.json,$(EMIT_TSCONFIGS)); do $(TYPECHECK) -p $$config || exit 1; done

# tsc-alias reads the ROOT tsconfig: pointed at a .configs/ file it resolves `paths` against
# .configs/ and leaves every `@/` import unrewritten.
build:
	@echo "START | Building $(notdir $(CURDIR))..."
	@$(TYPECHECK) -p tsconfig.json
ifneq ($(filter plain,$(FORMATS)),)
	@$(TSC) -p tsconfig.json --extendedDiagnostics
endif
ifneq ($(filter cjs,$(FORMATS)),)
	@echo ">>> Building CJS..."
	@$(TSC) -p $(CJS_TSCONFIG) --extendedDiagnostics
	@$(TSC_ALIAS) -p tsconfig.json $(if $(CJS_OUT),--outDir $(CJS_OUT))
endif
ifneq ($(filter esm,$(FORMATS)),)
	@echo ">>> Building ESM..."
	@$(TSC) -p $(ESM_TSCONFIG) --extendedDiagnostics
	@$(TSC_ALIAS) -p tsconfig.json --outDir dist/esm --resolve-full-paths
	@bun $(ROOT)/scripts/esm-marker.ts
endif
	$(if $(POST_BUILD),@$(POST_BUILD))
	@echo "DONE | Build completed successfully!"

# A stale .tsbuildinfo next to a .configs/ tsconfig makes tsc think it is up to date and emit
# nothing - a "DONE" build with an empty dist.
clean:
	@rm -rf dist *.tsbuildinfo .configs/builders/*.tsbuildinfo

# Type-check before cleaning: a failure after clean leaves an empty dist, which looks like a hundred
# unrelated import failures downstream.
rebuild: typecheck clean
	@$(MAKE) --no-print-directory build

lint:
	@$(BIN)/oxlint -c .configs/lints/oxlint.config.mts --deny-warnings $(LINT_IGNORE_FLAGS) .
	@$(BIN)/eslint -c .configs/lints/eslint.config.mjs $(LINT_IGNORE_FLAGS) .
	@bun fmt $(BUN_FMT_FLAGS) --check $(FMT_GLOB) $(LINT_IGNORE_FLAGS)

fmt:
	@$(BIN)/oxlint -c .configs/lints/oxlint.config.mts --fix $(LINT_IGNORE_FLAGS) .
	@$(BIN)/eslint -c .configs/lints/eslint.config.mjs --fix $(LINT_IGNORE_FLAGS) .
	@bun fmt $(BUN_FMT_FLAGS) $(FMT_GLOB) $(LINT_IGNORE_FLAGS)
