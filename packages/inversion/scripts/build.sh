#!/bin/sh
set -e

echo "START | Building application..."

# Type-check the whole project, including tests, without emitting (fails the build on any type error).
tsc --noEmit -p tsconfig.json

# Emit production output only - tests are excluded from dist via tsconfig.build.json, so the
# published package carries no compiled __tests__ and `bun test` does not run them a second time.
echo ">>> Building CJS..."
tsc -p .configs/tsconfig.build.json --extendedDiagnostics
tsc-alias -p tsconfig.json --outDir dist/cjs

echo ""

echo ">>> Building ESM..."
tsc -p .configs/tsconfig.esm.json --extendedDiagnostics
tsc-alias -p tsconfig.json --outDir dist/esm --resolve-full-paths
bun ../../scripts/esm-marker.ts

echo "DONE | Build completed successfully!"
