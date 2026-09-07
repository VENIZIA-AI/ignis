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

# The generated symbol table travels with the snapshot - `symbol` is dead in an npm install
# without it, so a missing table fails the build instead of shipping a half-working server.
echo ">>> Copying the symbol table..."
SYMBOLS_FILE="../../.agents/knowledge/reference/symbols.json"
if [ ! -f "$SYMBOLS_FILE" ]; then
  echo "ERROR | $SYMBOLS_FILE is missing - run 'make symbols-gen' first" >&2
  exit 1
fi
cp "$SYMBOLS_FILE" dist/corpus/symbols.json

# The release table travels with the snapshot for the same reason - `version` and `changes` are
# dead in an npm install without it.
echo ">>> Copying the release table..."
RELEASES_FILE="../../.agents/knowledge/reference/releases.json"
if [ ! -f "$RELEASES_FILE" ]; then
  echo "ERROR | $RELEASES_FILE is missing - run 'make releases-gen' first" >&2
  exit 1
fi
cp "$RELEASES_FILE" dist/corpus/releases.json

echo "DONE | Build completed successfully!"
