#!/bin/sh
set -e

echo "START | Building application..."

# NOTE: boot's test runner executes the COMPILED tests in dist/cjs/__tests__, so __tests__ are
# intentionally included in the build here (unlike core/helpers, which run tests from src).

# Build CJS (Node.js)
echo ">>> Building CJS..."
tsc -p tsconfig.json --extendedDiagnostics
tsc-alias -p tsconfig.json

echo ""

# Build ESM (Client/Browser)
echo ">>> Building ESM..."
tsc -p tsconfig.esm.json --extendedDiagnostics
tsc-alias -p tsconfig.esm.json

echo "DONE | Build completed successfully!"
