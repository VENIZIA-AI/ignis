#!/bin/bash

echo "START | Building application..."

# Compile TypeScript
tsc -p tsconfig.json --extendedDiagnostics

echo "DONE | Build completed successfully!"
