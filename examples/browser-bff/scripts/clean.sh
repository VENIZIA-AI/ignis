#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.vite/

# The database is not here: it lives in the browser's origin private file system, and only the
# browser can clear it (devtools > Application > Storage).
echo "Cleaned build artifacts"
