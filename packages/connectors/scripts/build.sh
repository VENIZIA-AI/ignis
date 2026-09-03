#!/bin/sh
set -e

echo "START | Building application..."

# Type-check the whole project, including tests, without emitting (fails the build on any type error).
tsc --noEmit -p tsconfig.json

# Emit production output only — tests are excluded from tsconfig.build.json / tsconfig.esm.json.
echo ">>> Building CJS..."
tsc -p tsconfig.build.json --extendedDiagnostics
tsc-alias -p tsconfig.build.json

# ESM as well as CJS: this package carries a browser-purity claim, and a browser bundler that finds
# only CommonJS either fails on the bare `require()` or needs a per-consumer pre-bundling
# workaround. The purity manifest enforces the `import` condition this build produces.
echo ">>> Building ESM..."
tsc -p tsconfig.esm.json --extendedDiagnostics
tsc-alias -p tsconfig.esm.json

echo "DONE | Build completed successfully!"
