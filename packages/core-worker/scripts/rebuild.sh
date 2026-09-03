#!/bin/sh
set -e

# Type-check BEFORE cleaning. `clean` removes dist, and build.sh type-checks __tests__ too, so a
# broken test used to abort the build with dist already gone - an empty dist looks like a hundred
# unrelated import failures.
echo "\nType-checking before touching dist ..."
tsc --noEmit -p tsconfig.json

# Both configs, because they are different programs: tsconfig.json carries Bun types for the tests,
# tsconfig.build.json carries none so the shipped sources cannot reach a Bun host. Only the second
# one runs during the emit step, which happens after dist is gone.
tsc --noEmit -p tsconfig.build.json

echo "\nCleaning up resources ..."
bun run clean

echo "\nBuilding latest release..."
bun run build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
