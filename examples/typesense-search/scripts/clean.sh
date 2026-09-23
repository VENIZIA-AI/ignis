#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.cache/

# `app_data/` is runtime state (logs), not a build artifact.
echo "Cleaned build artifacts"
