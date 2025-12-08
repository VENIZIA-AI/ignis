#!/bin/sh

echo "START | Building application..."

tsc -p tsconfig.jsx.json --extendedDiagnostics && tsc-alias -p tsconfig.jsx.json

echo "DONE | Build application"
