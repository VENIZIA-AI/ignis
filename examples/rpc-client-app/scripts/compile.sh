#!/usr/bin/env sh
# Typecheck, then bundle the app into ./dist. Fails where the generated client no longer matches the server.
set -eu
cd "$(dirname "$0")/.."

bun check
vite build
