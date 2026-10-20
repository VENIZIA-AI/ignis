#!/usr/bin/env sh
# Remove everything the build and the checks generate.
# `app_data/` is runtime state, not a build artifact: it survives a clean.
set -eu
cd "$(dirname "$0")/.."

rm -rf dist node_modules/.cache *.tsbuildinfo .eslintcache
