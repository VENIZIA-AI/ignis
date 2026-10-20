#!/usr/bin/env sh
# Remove everything the build and the checks generate.
# The database is not here: it lives in the browser's origin private file system, and only the
# browser can clear it (devtools > Application > Storage).
set -eu
cd "$(dirname "$0")/.."

rm -rf dist node_modules/.vite node_modules/.tmp
