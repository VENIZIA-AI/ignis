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

# After vitepress: the built home page must hold its footer and canvases, no output line may carry a
# server render error (scripts/checks/wiki-build.ts).
bun ../../scripts/checks/wiki-build.ts "$LOG"

echo "DONE | Build completed successfully!"
