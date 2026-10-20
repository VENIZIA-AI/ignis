#!/usr/bin/env sh
# Lint this package with oxlint, eslint and oxfmt.
#   sh scripts/lint.sh                  checks the whole package
#   sh scripts/lint.sh --fix            fixes the whole package
#   sh scripts/lint.sh [--fix] <files>  handles only those files (paths relative to the package)
# Paths to skip go in .configs/.lintignore, one gitignore-style pattern per line, relative to the package.
set -eu
cd "$(dirname "$0")/.."

ESLINT_CACHE='--cache --cache-location node_modules/.cache/eslint/'
FIX=
if [ "${1:-}" = "--fix" ]; then
  FIX=1
  shift
fi

# An ignore file resolves its patterns from its own folder, so each pattern goes on the command line,
# which resolves from the package root: --ignore-pattern for oxlint and eslint, !pattern for oxfmt.
LINT_IGNORE=
FORMAT_IGNORE=
if [ -f .configs/.lintignore ]; then
  while IFS= read -r PATTERN || [ -n "$PATTERN" ]; do
    case "$PATTERN" in
      '' | '#'*) ;;
      *)
        LINT_IGNORE="$LINT_IGNORE --ignore-pattern $PATTERN"
        FORMAT_IGNORE="$FORMAT_IGNORE !$PATTERN"
        ;;
    esac
  done < .configs/.lintignore
fi
# The option strings are split on spaces below; a pattern in them must stay a glob, not expand.
set -f

WHOLE=
ESLINT_QUIET=
UNMATCHED=
if [ $# -eq 0 ]; then
  WHOLE=1
  set -- .
else
  # Keep only the files the linters handle; a list without one has nothing to lint.
  for FILE; do
    shift
    case "$FILE" in
      *.ts | *.tsx | *.mts | *.js | *.mjs) set -- "$@" "$FILE" ;;
    esac
  done
  if [ $# -eq 0 ]; then
    exit 0
  fi
  ESLINT_QUIET=--no-warn-ignored
  UNMATCHED=--no-error-on-unmatched-pattern
fi

if [ -n "$FIX" ]; then
  oxlint -c .configs/oxlint.config.mts $LINT_IGNORE $UNMATCHED --fix "$@"
  eslint -c .configs/eslint.config.mjs $ESLINT_CACHE $ESLINT_QUIET $LINT_IGNORE --fix "$@"
else
  oxlint -c .configs/oxlint.config.mts $LINT_IGNORE $UNMATCHED --deny-warnings "$@"
  eslint -c .configs/eslint.config.mjs $ESLINT_CACHE $ESLINT_QUIET $LINT_IGNORE "$@"
fi

# The whole package goes to oxfmt as a glob, so it formats the same files the linters check.
if [ -n "$WHOLE" ]; then
  set -- '**/*.{ts,tsx,mts,js,mjs}'
fi
if [ -n "$FIX" ]; then
  oxfmt -c .configs/oxfmt.config.mts $UNMATCHED "$@" $FORMAT_IGNORE
else
  oxfmt -c .configs/oxfmt.config.mts $UNMATCHED --check "$@" $FORMAT_IGNORE
fi
