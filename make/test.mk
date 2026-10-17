# Package test suites, the browser-purity gate, the clean-install gate, and the gate scripts' own tests.

# Packages with no suite of their own; their `test-<pkg>` says so and passes.
NO_TEST := dev-configs filter
# Packages whose package.json owns the test command (NODE_ENV=test + .env.test); `bun run` appends
# the flags to it. The rest run `bun test` directly.
TEST_SCRIPT := boot
TEST_PACKAGES := $(filter-out $(NO_TEST),$(PACKAGES))

# Packages with an entry claimed browser-pure (scripts/purity/manifest.ts); the rest skip.
PURE := inversion filter helpers kernel connectors core-worker

TEST_TARGETS := $(addprefix test-,$(PACKAGES))
PURITY_TARGETS := $(addprefix purity-,$(PACKAGES))
CLEAN_INSTALL_TARGETS := $(addprefix clean-install-,$(PACKAGES))

.PHONY: test-all test-scripts purity purity-test clean-install \
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
	@cd packages/$* && $(if $(filter $*,$(TEST_SCRIPT)),bun run test,bun test) $(BUN_TEST_FLAGS)

$(addprefix test-,$(NO_TEST)):
	@echo "ℹ️  No test suite in this package - skipping."

# The repository gate scripts' own regression tests (module-cycles, split-report, public-surface,
# wiki-source-links) - same reasoning as purity-test, nothing else runs them.
test-scripts:
	@echo "🔍 Running the repository gate scripts' regression tests..."
	@bun test scripts/__tests__

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

$(addprefix purity-,$(PURE)): purity-%:
	@echo "🔍 Checking browser purity for $(call PKG_NAME,$*)..."
	@bun scripts/purity/cli.ts $*

$(addprefix purity-,$(filter-out $(PURE),$(PACKAGES))):
	@echo "ℹ️  No browser-pure entry claimed for this package - skipping."

# ----------------------------------------------------------------------------
# CLEAN-INSTALL TARGETS
# Packs each package, installs it ALONE into an empty project with only its required peers plus the
# ones scripts/clean-install/manifest.ts grants a sub-path, and loads every published sub-path under
# Bun, Node ESM, Node CJS and a browser build - hoisted and isolated. The workspace hoists every
# optional peer, so a leak is invisible anywhere else. Needs a build first, and `node` on PATH.
# ----------------------------------------------------------------------------
clean-install:
	@echo "🔍 Loading every published sub-path from a clean install..."
	@bun scripts/clean-install/cli.ts

$(CLEAN_INSTALL_TARGETS): clean-install-%:
	@echo "🔍 Loading every published sub-path of $* from a clean install..."
	@bun scripts/clean-install/cli.ts $*
