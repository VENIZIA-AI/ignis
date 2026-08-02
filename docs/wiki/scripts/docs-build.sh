#!/bin/sh
set -e

echo "START | Building application..."

bun run docs:clean

# Before vitepress, because an unlinked page is not a dead link - the build stays green while a
# reader has no way to reach the page.
bun scripts/check-sidebar.ts

vitepress build site

echo "DONE | Build completed successfully!"
