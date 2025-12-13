#!/bin/sh

echo "START | Building application..."

# Build CJS (Node.js)
echo ">>> Building CJS..."
tsc -p tsconfig.json --extendedDiagnostics && tsc-alias -p tsconfig.json

echo ""

# Build ESM (Client/Browser)
echo ">>> Building ESM..."
tsc -p tsconfig.esm.json --extendedDiagnostics && tsc-alias -p tsconfig.esm.json

echo "DONE | Build completed successfully!"
