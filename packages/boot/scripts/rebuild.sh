#!/bin/sh
set -e

# Type-check BEFORE cleaning. `clean` removes dist, and build.sh type-checks __tests__ too, so a
# broken test used to abort the build with dist already gone - an empty dist looks like a hundred
# unrelated import failures.
echo "\nType-checking before touching dist ..."
tsc --noEmit -p tsconfig.json

# BOTH programs, because build.sh emits both. tsconfig.esm.json extends this one but swaps
# module/moduleResolution, so it checks the same files under different rules and can fail where the
# CJS pass passed. Guarding only the first let clean delete dist, CJS emit, the ESM pass fail and
# set -e abort - leaving dist holding cjs/ and no esm/, which every `main`-resolving consumer hides.
tsc --noEmit -p tsconfig.esm.json

echo "\nCleaning up resources ..."
bun run clean

echo "\nBuilding latest release..."
bun run build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
