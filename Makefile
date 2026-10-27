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

# Every temp folder a test, script or build makes lands in the gitignored .agents/local/tmp, never in
# the system temp: os.tmpdir() reads TMPDIR. `make tmp-leak-check` fails when a test run breaks this.
# (The clean-install gate is the exception: it needs a folder outside the repository, see make/test.mk.)
export TMPDIR := $(CURDIR)/.agents/local/tmp
# Node writes its compile cache to the system temp unless told otherwise.
export NODE_COMPILE_CACHE := $(CURDIR)/.agents/local/cache/node-compile
$(shell mkdir -p $(TMPDIR))
SYSTEM_TMPDIR := $(or $(IGNIS_SYSTEM_TMPDIR),/tmp)

# The npm name of a package directory, read from its package.json: $(call PKG_NAME,kernel).
PKG_NAME = $(shell sed -n 's/^  "name": "\(.*\)",$$/\1/p' packages/$(1)/package.json)

# The wiki link and anchor gates are VULCAN's (wiki-links-check, wiki-anchors-check): they need the repository the
# wiki links point into. The generated reference tables name symbols and paths of the code, not links, so the
# link gate does not read them.
WIKI_REPO := VENIZIA-AI/ignis
WIKI_LINKS_FLAGS := --skip .agents/knowledge/reference/public-surface.md,.agents/knowledge/reference/source-map.md,.agents/knowledge/reference/components.md,.agents/knowledge/reference/helpers.md,.agents/knowledge/reference/binding-keys.md,.agents/knowledge/reference/makefile-targets.md

# VULCAN's shared targets (okf, atlas tables, agent setup, the wiki gates). `-include`: a fresh clone has no
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
