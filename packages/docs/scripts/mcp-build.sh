#!/bin/sh
set -e

echo "START | Building application..."

tsc -p tsconfig.mcp.json --extendedDiagnostics
tsc-alias -p tsconfig.mcp.json

echo "DONE | Build completed successfully!"
