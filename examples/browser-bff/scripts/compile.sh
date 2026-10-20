#!/usr/bin/env sh
# Bundle the app into ./dist. The database is PGlite on the browser's origin private file system.
set -eu
cd "$(dirname "$0")/.."

APP_ENV_PGLITE_DATA_DIR=opfs-ahp://ignis-browser-bff vite build
