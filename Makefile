# The IGNIS monorepo. Each file under make/ holds one job; `make help` lists every target.
# make/project.mk is not included here: it is the per-package include, used by packages/*/Makefile.

.PHONY: all

# A bare `make` prints the target list; `make all` / `make build` builds.
.DEFAULT_GOAL := help

all: build

# Every package directory under packages/. Each per-package target (`<pkg>`, `update-<pkg>`,
# `lint-<pkg>`, `lint-fix-<pkg>`, `test-<pkg>`, `purity-<pkg>`, `clean-install-<pkg>`) is generated
# from this list - add a package here and every target exists for it.
PACKAGES := dev-configs inversion filter helpers boot kernel connectors core-worker core-server

# The npm name of a package directory, read from its package.json: $(call PKG_NAME,kernel).
PKG_NAME = $(shell sed -n 's/^  "name": "\(.*\)",$$/\1/p' packages/$(1)/package.json)

# VULCAN's shared targets (okf, atlas tables, agent setup). `-include`: a fresh clone has no
# node_modules yet, and `bun install` must still run.
-include node_modules/@venizia/vulcan/base/make/vulcan.mk

include make/build.mk
include make/knowledge.mk
include make/release.mk
include make/lint.mk
include make/test.mk
include make/help.mk

# `core` is the historical name for core-server and stays an alias - it is in muscle memory, in the
# wiki, and in scripts outside this repository. Every `<job>-core` is an alias of `<job>-core-server`.
CORE_ALIASES := update-core lint-core lint-fix-core test-core purity-core clean-install-core
.PHONY: core $(CORE_ALIASES)

core: core-server

$(CORE_ALIASES): %-core: %-core-server
