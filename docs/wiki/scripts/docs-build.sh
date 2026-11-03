#!/bin/sh
set -e

echo "START | Building application..."

bun run docs:clean

# Before vitepress, because an unlinked page is not a dead link - the build stays green while a
# reader has no way to reach the page.
bun scripts/check-sidebar.mts

# VitePress exits 0 when a component throws while a page renders on the server: it prints the
# error, drops the component and goes on. The output is kept so that check-build can read it.
LOG="$(mktemp "${TMPDIR:-/tmp}/ignis-wiki-build.XXXXXX")"
trap 'rm -f "$LOG"' EXIT

status=0
vitepress build site > "$LOG" 2>&1 || status=$?
cat "$LOG"

if [ "$status" -ne 0 ]; then
  exit "$status"
fi

# After vitepress: the shared build check reads the output and the built pages (a server render error
# in the log; the home page's hero, footer, canvases and top bar; the style sheets; an inner page with
# no footer). Only `--check --log` here: without `--check` it would build again.
bun site/.vitepress/theme/shared/build-check.ts --check --log "$LOG"

echo "DONE | Build completed successfully!"
