#!/bin/sh
set -e

echo "START | Building application..."

# Type-check the whole project, including tests, without emitting (fails the build on any type error).
tsc --noEmit -p tsconfig.json

# Emit production output only - tests are excluded from dist via tsconfig.build.json.
echo ">>> Building CJS..."
tsc -p tsconfig.build.json --extendedDiagnostics
tsc-alias -p tsconfig.build.json

echo ""

echo ">>> Building ESM..."
tsc -p tsconfig.esm.json --extendedDiagnostics
tsc-alias -p tsconfig.esm.json

echo "DONE | Build completed successfully!"
