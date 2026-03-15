#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.cache/

# Remove log files
rm -f *.log
rm -f .*.log
rm -f .*-audit.json
rm -rf dist *.tsbuildinfo .eslintcache

echo "Cleaned build artifacts and logs"
