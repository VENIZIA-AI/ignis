#!/bin/sh

echo "START | Building application..."

tsc -p tsconfig.json --extendedDiagnostics && tsc-alias -p tsconfig.json

echo "DONE | Build application"
