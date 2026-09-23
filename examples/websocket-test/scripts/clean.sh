#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.cache/

# `app_data/` is runtime state, not a build artifact: logs survive a clean.
echo "Cleaned build artifacts"
