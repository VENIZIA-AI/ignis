#!/bin/sh
set -e

echo "START | Building application..."

# Type-check the whole project, including tests, without emitting (fails the build on any type error).
tsc --noEmit -p tsconfig.json

# Emit production output only - tests are excluded from dist via tsconfig.build.json.
echo ">>> Building CJS..."
tsc -p .configs/tsconfig.build.json --extendedDiagnostics
tsc-alias -p tsconfig.json --outDir dist/cjs
# tsc writes 0644, so a rebuilt `bin` target is not executable until the next `bun install`.
chmod +x dist/cjs/clis/*.js

echo ""

echo ">>> Building ESM..."
tsc -p .configs/tsconfig.esm.json --extendedDiagnostics
tsc-alias -p tsconfig.json --outDir dist/esm --resolve-full-paths
bun ../../scripts/esm-marker.ts

echo "DONE | Build completed successfully!"
