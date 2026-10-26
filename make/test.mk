# Package test suites, the browser-purity gate, the clean-install gate, and the gate scripts' own tests.

# Packages with no suite of their own; their `test-<pkg>` says so and passes.
NO_TEST := filter
# The test environment, in one place: logs land in the gitignored app_data of the package, not its root.
# The logger path is absolute: a test that spawns a process in another folder (a temp folder) must not
# make an app_data there.
TEST_ENV := NODE_ENV=test APP_ENV_LOGGER_FOLDER_PATH=$$PWD/app_data/logs
TEST_PACKAGES := $(filter-out $(NO_TEST),$(PACKAGES))

# Packages with an entry claimed browser-pure (scripts/checks/purity/manifest.ts); the rest skip.
PURE := inversion filter helpers kernel connectors core-worker

TEST_TARGETS := $(addprefix test-,$(PACKAGES))
# The browser-purity engine is `devz check purity` (packages/dev-configs); this repository only owns the claims.
PURITY := bun packages/dev-configs/dist/cli/index.js check purity --claims scripts/checks/purity/manifest.ts

PURITY_TARGETS := $(addprefix purity-,$(PACKAGES))
CLEAN_INSTALL_TARGETS := $(addprefix clean-install-,$(PACKAGES))

.PHONY: test-all test-scripts build-checks examples-check purity purity-test clean-install tmp-leak-check \
        $(TEST_TARGETS) $(PURITY_TARGETS) $(CLEAN_INSTALL_TARGETS)

# ----------------------------------------------------------------------------
# TEST TARGETS
# The one home of the test flags: CI calls these targets, and so should you. `--parallel` runs the
# files across worker processes and implies `--isolate` - a fresh global and module registry per
# file, servers and timers a file left open closed between files - so a mock, env or TLS setting one
# file leaks cannot pass or fail another. Needs a build first (B-05).
# ----------------------------------------------------------------------------
BUN_TEST_FLAGS ?= --parallel

test-all: $(addprefix test-,$(TEST_PACKAGES))

$(addprefix test-,$(TEST_PACKAGES)): test-%:
	@cd packages/$* && $(TEST_ENV) bun test ./src $(BUN_TEST_FLAGS)

$(addprefix test-,$(NO_TEST)):
	@echo "ℹ️  No test suite in this package - skipping."

# A test run must leave nothing in the system temp (a test used /tmp, not os.tmpdir()) and nothing in
# .agents/local/tmp (a test made a folder and kept it). CI runs the same snapshot and verify around its
# test steps; here the whole suite runs between them. Needs a build first. IGNIS_TMP_LEAK_IGNORE (a
# regular expression on the entry name) skips what another program writes to /tmp meanwhile.
tmp-leak-check:
	@bun scripts/checks/tmp-leak/cli.ts snapshot
	@status=0; $(MAKE) test-all test-scripts || status=$$?; \
	bun scripts/checks/tmp-leak/cli.ts verify || status=1; \
	exit $$status

# The repository gate scripts' own regression tests (module-cycles, split-report, wiki-source-links,
# wiki-anchors, release-args, clean-install) - same reasoning as purity-test, nothing else runs them.
test-scripts:
	@echo "🔍 Running the repository gate scripts' regression tests..."
	@bun test scripts/release/__tests__ scripts/preset/__tests__ scripts/checks/__tests__ scripts/build/__tests__ scripts/wiki/__tests__

# ----------------------------------------------------------------------------
# PURITY TARGETS
# Bundles each entry claimed browser-pure and fails on node builtins or globals.
# Requires the package's dist - run the matching build target first.
# ----------------------------------------------------------------------------
purity:
	@echo "🔍 Checking browser purity for all claimed entries..."
	@$(PURITY)

# Checks that read the built dist, so they run after a build, never in test-scripts.
build-checks:
	@echo "🔍 Checking the build output: self-contained sourcemaps, the oxlint subpath loads no ESLint..."
	@bun test scripts/build/build-checks

# Every example type-checks against the built packages, so a type a package forgot to export, or a
# signature that changed, breaks here and not in a consumer. Reports every failing example, then
# fails. Needs a build and `bun install --frozen-lockfile` after it (the workspace links).
examples-check:
	@echo "🔍 Type-checking the examples..."
	@failed=""; \
	for dir in examples/*/; do \
	  name=$$(basename $$dir); \
	  [ -f "$$dir/tsconfig.json" ] || continue; \
	  if (cd $$dir && $(CURDIR)/node_modules/.bin/tsc --noEmit -p tsconfig.json); then echo "  ok   $$name"; else echo "  FAIL $$name"; failed="$$failed $$name"; fi; \
	done; \
	if [ -n "$$failed" ]; then echo "❌ examples that do not type-check:$$failed"; exit 1; fi

# The probe's own regression tests. They live outside every package, so `cd packages/<x> && bun test`
# never discovers them - without this target nothing runs the tests that guard the CI gate.
purity-test:
	@echo "🔍 Running the purity probe's regression tests..."
	@bun test scripts/checks/purity/__tests__ packages/dev-configs/src/__tests__/checks

$(addprefix purity-,$(PURE)): purity-%:
	@echo "🔍 Checking browser purity for $(call PKG_NAME,$*)..."
	@$(PURITY) $*

$(addprefix purity-,$(filter-out $(PURE),$(PACKAGES))):
	@echo "ℹ️  No browser-pure entry claimed for this package - skipping."

# ----------------------------------------------------------------------------
# CLEAN-INSTALL TARGETS
# Packs each package, installs it ALONE into an empty project with only its required peers plus the
# ones scripts/checks/clean-install/manifest.ts grants a sub-path, and loads every published sub-path under
# Bun and a browser build - hoisted and isolated. The workspace hoists every optional peer, so a
# leak is invisible anywhere else. Needs a build first.
# ----------------------------------------------------------------------------
# A sandbox below the repository would resolve the repository's own node_modules, so this gate (and
# only this one) keeps its sandboxes in the system temp and removes them when it ends.
clean-install:
	@echo "🔍 Loading every published sub-path from a clean install..."
	@TMPDIR=$(SYSTEM_TMPDIR) bun scripts/checks/clean-install/cli.ts

$(CLEAN_INSTALL_TARGETS): clean-install-%:
	@echo "🔍 Loading every published sub-path of $* from a clean install..."
	@TMPDIR=$(SYSTEM_TMPDIR) bun scripts/checks/clean-install/cli.ts $*
