#!/usr/bin/env sh
# Lint this app with eslint. `sh scripts/lint.sh` checks; `--fix` fixes.
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--fix" ]; then
  eslint . --fix
else
  eslint .
fi
