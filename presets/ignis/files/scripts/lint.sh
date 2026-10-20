#!/usr/bin/env sh
# Lint this app with oxlint, eslint and oxfmt. `sh scripts/lint.sh` checks; `--fix` fixes.
set -eu
cd "$(dirname "$0")/.."

FILES='**/*.{ts,tsx,mts,js,mjs}'
ESLINT_CACHE='--cache --cache-location node_modules/.cache/eslint/'

if [ "${1:-}" = "--fix" ]; then
  oxlint -c .configs/oxlint.config.mts --fix
  eslint -c .configs/eslint.config.mjs $ESLINT_CACHE --fix .
  oxfmt -c .configs/oxfmt.config.mts "$FILES"
else
  oxlint -c .configs/oxlint.config.mts --deny-warnings
  eslint -c .configs/eslint.config.mjs $ESLINT_CACHE .
  oxfmt -c .configs/oxfmt.config.mts --check "$FILES"
fi
