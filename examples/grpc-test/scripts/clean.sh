#!/usr/bin/env sh
# Remove everything the build and the checks generate.
# `app_data/` (runtime state) and `certs/` (your local certificate) survive a clean.
set -eu
cd "$(dirname "$0")/.."

rm -rf dist node_modules/.cache *.tsbuildinfo .eslintcache
