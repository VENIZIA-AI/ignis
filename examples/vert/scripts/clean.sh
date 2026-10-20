#!/usr/bin/env sh
# Remove everything the build and the checks generate.
set -eu
cd "$(dirname "$0")/.."

rm -rf dist *.tsbuildinfo .eslintcache artifact.zip
