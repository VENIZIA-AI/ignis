#!/bin/bash
set -e

echo "Building @venizia/dev-configs..."

# Compile TypeScript
tsc -p tsconfig.json --extendedDiagnostics

echo "Build completed successfully!"
