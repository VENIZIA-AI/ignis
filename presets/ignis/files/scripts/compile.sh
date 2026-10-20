#!/usr/bin/env sh
# Compile the app to ./dist/bin, with the commit, branch and build time baked in.
# The target comes from BUN_TARGET (default bun-linux-x64).
set -eu
cd "$(dirname "$0")/.."

bun scripts/compile.ts
