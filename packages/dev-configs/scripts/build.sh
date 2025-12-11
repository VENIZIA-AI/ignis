#!/bin/bash
set -e

echo "Building @venizia/dev-configs..."

# Compile TypeScript
tsc -p tsconfig.json --extendedDiagnostics && tsc-alias -p tsconfig.json

echo "Build completed successfully!"
