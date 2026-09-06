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
# changelogs/ as its own `changelog` corpus. Only *.md files are copied - the wiki's own static
# assets (docs/wiki/content/public/*) never belong in a text corpus. The knowledge bundle is never
# copied - repo-only.
echo ">>> Copying the corpus snapshot..."
WIKI_CONTENT_DIR="../../docs/wiki/content"
rm -rf dist/corpus
mkdir -p dist/corpus/wiki dist/corpus/changelogs

(cd "$WIKI_CONTENT_DIR" && find . -name changelogs -prune -o -name '*.md' -print) |
  while IFS= read -r relative_path; do
    mkdir -p "dist/corpus/wiki/$(dirname "$relative_path")"
    cp "$WIKI_CONTENT_DIR/$relative_path" "dist/corpus/wiki/$relative_path"
  done

(cd "$WIKI_CONTENT_DIR/changelogs" && find . -name '*.md' -print) |
  while IFS= read -r relative_path; do
    mkdir -p "dist/corpus/changelogs/$(dirname "$relative_path")"
    cp "$WIKI_CONTENT_DIR/changelogs/$relative_path" "dist/corpus/changelogs/$relative_path"
  done

echo "DONE | Build completed successfully!"
