#!/bin/sh

echo "START | Building application..."

tsc -p tsconfig.json --extendedDiagnostics

echo "DONE | Build application"
