#!/bin/bash
set -e

echo "Rebuilding @venizia/dev-configs..."

# Clean
sh ./scripts/clean.sh

# Build
sh ./scripts/build.sh

echo "Rebuild completed!"
