#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.cache/

# `app_data/` is runtime state, not a build artifact: logs and the embedded database survive a clean.
echo "Cleaned build artifacts"
