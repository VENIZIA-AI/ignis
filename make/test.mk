# Package test suites, the browser-purity gate, the clean-install gate, and the gate scripts' own tests.

.PHONY: test-all test-inversion test-helpers test-boot test-kernel test-connectors test-core-worker \
        test-core-server test-atlas test-scripts \
        purity purity-test purity-inversion purity-filter purity-helpers purity-kernel purity-connectors \
        purity-core-worker purity-dev-configs purity-boot purity-core purity-core-server purity-atlas \
        clean-install clean-install-inversion clean-install-filter clean-install-helpers clean-install-boot \
        clean-install-kernel clean-install-connectors clean-install-core-worker clean-install-core-server \
        clean-install-atlas clean-install-dev-configs clean-install-core

# ----------------------------------------------------------------------------
# TEST TARGETS
# The one home of the test flags: CI calls these targets, and so should you. `--parallel` runs the
# files across worker processes and implies `--isolate` - a fresh global and module registry per
# file, servers and timers a file left open closed between files - so a mock, env or TLS setting one
# file leaks cannot pass or fail another. `filter` has no suite. Needs a build first (B-05).
# ----------------------------------------------------------------------------
BUN_TEST_FLAGS ?= --parallel

test-all: test-inversion test-helpers test-boot test-kernel test-connectors test-core-worker test-core-server test-atlas

test-inversion:
	@cd packages/inversion && bun test $(BUN_TEST_FLAGS)

test-helpers:
	@cd packages/helpers && bun test $(BUN_TEST_FLAGS)

# boot's package.json owns its command (NODE_ENV=test + .env.test); `bun run` appends the flags to it.
test-boot:
	@cd packages/boot && bun run test $(BUN_TEST_FLAGS)

test-kernel:
	@cd packages/kernel && bun test $(BUN_TEST_FLAGS)

test-connectors:
	@cd packages/connectors && bun test $(BUN_TEST_FLAGS)

test-core-worker:
	@cd packages/core-worker && bun test $(BUN_TEST_FLAGS)

test-core-server:
	@cd packages/core-server && bun test $(BUN_TEST_FLAGS)

# atlas's package.json owns its command (NODE_ENV=test + .env.test); `bun run` appends the flags to it.
test-atlas:
	@cd packages/atlas && bun run test $(BUN_TEST_FLAGS)

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

purity-inversion:
	@echo "🔍 Checking browser purity for @venizia/ignis-inversion..."
	@bun scripts/purity/cli.ts inversion

purity-filter:
	@echo "🔍 Checking browser purity for @venizia/ignis-filter..."
	@bun scripts/purity/cli.ts filter

purity-helpers:
	@echo "🔍 Checking browser purity for @venizia/ignis-helpers..."
	@bun scripts/purity/cli.ts helpers

purity-kernel:
	@echo "🔍 Checking browser purity for @venizia/ignis-kernel..."
	@bun scripts/purity/cli.ts kernel

purity-connectors:
	@echo "🔍 Checking browser purity for @venizia/ignis-connectors..."
	@bun scripts/purity/cli.ts connectors

purity-core-worker:
	@echo "🔍 Checking browser purity for @venizia/ignis-worker..."
	@bun scripts/purity/cli.ts core-worker

purity-dev-configs purity-boot purity-core purity-core-server purity-atlas:
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

clean-install-dev-configs clean-install-inversion clean-install-filter clean-install-helpers clean-install-boot clean-install-kernel clean-install-connectors clean-install-core-worker clean-install-core-server clean-install-atlas:
	@echo "🔍 Loading every published sub-path of $(patsubst clean-install-%,%,$@) from a clean install..."
	@bun scripts/clean-install/cli.ts $(patsubst clean-install-%,%,$@)

clean-install-core:
	@echo "ℹ️  No runtime sub-path to load for this package - skipping."
