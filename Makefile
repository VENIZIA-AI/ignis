# The IGNIS monorepo. Each file under make/ holds one job; `make help` lists every target.
# make/project.mk is not included here: it is the per-package include, used by packages/*/Makefile.
# The examples are not built, linted or tested from make - see scripts/examples.ts.

.PHONY: all

# A bare `make` prints the target list; `make all` / `make build` builds.
.DEFAULT_GOAL := help

all: build

# Every package, in the order `clean` walks them and `lint-<pkg>` / `fmt-<pkg>` are generated for.
PACKAGES := dev-configs inversion filter helpers boot kernel connectors core-worker core-server atlas

include make/build.mk
include make/knowledge.mk
include make/release.mk
include make/lint.mk
include make/test.mk
include make/help.mk
