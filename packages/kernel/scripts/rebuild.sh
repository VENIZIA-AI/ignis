#!/bin/sh
set -e

# Type-check BEFORE cleaning. `clean` removes dist, and build.sh type-checks __tests__ too, so a
# broken test used to abort the build with dist already gone - an empty dist looks like a hundred
# unrelated import failures.
echo "\nType-checking before touching dist ..."
tsc --noEmit -p tsconfig.json

echo "\nCleaning up resources ..."
bun run clean

echo "\nBuilding latest release..."
bun run build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
