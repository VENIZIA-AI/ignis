#!/bin/bash
set -e

echo "Building @venizia/dev-configs..."

# Clean previous build
rm -rf dist

# Compile TypeScript
tsc -p tsconfig.json

echo "Build completed successfully!"
