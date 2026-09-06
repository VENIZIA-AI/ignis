#!/bin/sh
set -e

echo "START | Building application..."

# Type-check the whole project, including tests, without emitting (fails the build on any type error).
tsc --noEmit -p tsconfig.json

# Emit production output only - tests are excluded from tsconfig.build.json.
echo ">>> Building CJS..."
tsc -p tsconfig.build.json --extendedDiagnostics
tsc-alias -p tsconfig.build.json

# Packages the npm-mode snapshot: docs/wiki/content (minus changelogs/) as the `wiki` corpus,
# changelogs/ as its own `changelog` corpus. The knowledge bundle is never copied - repo-only.
echo ">>> Copying the corpus snapshot..."
WIKI_CONTENT_DIR="../../docs/wiki/content"
rm -rf dist/corpus
mkdir -p dist/corpus/wiki dist/corpus/changelogs
find "$WIKI_CONTENT_DIR" -mindepth 1 -maxdepth 1 ! -name changelogs -exec cp -r {} dist/corpus/wiki/ \;
cp -r "$WIKI_CONTENT_DIR"/changelogs/. dist/corpus/changelogs/

echo "DONE | Build completed successfully!"
