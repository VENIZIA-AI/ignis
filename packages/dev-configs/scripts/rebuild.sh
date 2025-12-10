#!/bin/bash
set -e

echo "Rebuilding @vez/dev-configs..."

# Clean
sh ./scripts/clean.sh

# Build
sh ./scripts/build.sh

echo "Rebuild completed!"
