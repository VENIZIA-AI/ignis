#!/usr/bin/env sh
# Lint this package with oxlint, eslint and oxfmt.
#   sh scripts/lint.sh                  checks the whole package
#   sh scripts/lint.sh --fix            fixes the whole package
#   sh scripts/lint.sh [--fix] <files>  handles only those files (paths relative to the package)
# Paths to skip: .configs/lints/.ignore (oxlint, eslint) and .configs/formatters/.ignore (oxfmt), one
# gitignore-style pattern per line, relative to the package.
set -eu
cd "$(dirname "$0")/.."

ESLINT_CACHE='--cache --cache-location node_modules/.cache/eslint/'
FIX=
if [ "${1:-}" = "--fix" ]; then
  FIX=1
  shift
fi

# An ignore file resolves its patterns from its own folder, so each pattern goes on the command line,
# which resolves from the package root. Prints " <prefix><pattern>" for each pattern of file $1, prefix $2.
ignore_options() {
  if [ -f "$1" ]; then
    while IFS= read -r PATTERN || [ -n "$PATTERN" ]; do
      case "$PATTERN" in
        '' | '#'*) ;;
        *) printf ' %s%s' "$2" "$PATTERN" ;;
      esac
    done < "$1"
  fi
}
LINT_IGNORE=$(ignore_options .configs/lints/.ignore '--ignore-pattern ')
FORMAT_IGNORE=$(ignore_options .configs/formatters/.ignore '!')
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
  oxlint -c .configs/lints/oxlint.config.mts $LINT_IGNORE $UNMATCHED --fix "$@"
  eslint -c .configs/lints/eslint.config.mjs $ESLINT_CACHE $ESLINT_QUIET $LINT_IGNORE --fix "$@"
else
  oxlint -c .configs/lints/oxlint.config.mts $LINT_IGNORE $UNMATCHED --deny-warnings "$@"
  eslint -c .configs/lints/eslint.config.mjs $ESLINT_CACHE $ESLINT_QUIET $LINT_IGNORE "$@"
fi

# The whole package goes to oxfmt as a glob, so it formats the same files the linters check.
if [ -n "$WHOLE" ]; then
  set -- '**/*.{ts,tsx,mts,js,mjs}'
fi
if [ -n "$FIX" ]; then
  oxfmt -c .configs/formatters/oxfmt.config.mts $UNMATCHED "$@" $FORMAT_IGNORE
else
  oxfmt -c .configs/formatters/oxfmt.config.mts $UNMATCHED --check "$@" $FORMAT_IGNORE
fi
