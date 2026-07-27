#!/bin/bash

# Usage: ./force-update.sh [latest|next|highest]
# Default: latest
# - latest/next: Use npm dist-tag to resolve version
# - highest: Use the highest released version (sorted by semver)

TAG="${1:-latest}"

if [ "$TAG" != "latest" ] && [ "$TAG" != "next" ] && [ "$TAG" != "highest" ]; then
  echo "ERROR | Invalid tag: $TAG (must be 'latest', 'next', or 'highest')"
  exit 1
fi

echo "START | Force updating from NPM registry (tag: $TAG)..."

EXTRA_PACKAGES="@minimaltech/eslint-node"

# Derived from package.json, never hardcoded: a hardcoded list silently goes stale when a new
# workspace dependency is added - that is how @venizia/ignis-filter went unrefreshed in core, and
# @venizia/ignis-inversion in filter. EXTRA_PACKAGES carries any non-@venizia pin.
DERIVED=$(jq -r '[(.dependencies // {}), (.devDependencies // {}), (.peerDependencies // {})] | add // {} | keys[] | select(startswith("@venizia/"))' package.json | sort -u | tr '\n' ' ')
PACKAGES="$EXTRA_PACKAGES $DERIVED"

if [ -z "$(echo "$PACKAGES" | tr -d ' ')" ]; then
  echo "DONE | No NPM-published dependencies to refresh."
  exit 0
fi

for pkg in $PACKAGES; do
  # The root workspaces.catalog owns a catalogued range; overwriting it with a registry version
  # breaks `make catalog-check`, which the release workflow runs a few steps later.
  CURRENT=$(jq -r --arg p "$pkg" '[(.dependencies // {}), (.devDependencies // {}), (.peerDependencies // {})] | add // {} | .[$p] // ""' package.json)
  if [ "$CURRENT" = "catalog:" ]; then
    echo "[$pkg] pinned by the root workspaces.catalog, SKIP..."
    continue
  fi

  echo "[$pkg] Fetching $TAG version..."

  if [ "$TAG" = "highest" ]; then
    # Get the highest released version by semver sort
    VERSION=$(npm view "$pkg" versions --json 2>/dev/null | grep '"' | tail -1 | tr -d ' ",' )
  else
    # Get version for specific dist-tag from npm registry
    VERSION=$(npm view "$pkg" dist-tags."$TAG" 2>/dev/null)
  fi

  if [ -z "$VERSION" ]; then
    echo "[$pkg] Could not fetch version, SKIP..."
    continue
  fi

  echo "[$pkg] $TAG version: $VERSION"

  # Escape package name for sed (replace @ and / with escaped versions)
  PACKAGE_NAME=$(echo "$pkg" | sed 's/[\/&]/\\&/g')

  # This handles both dependencies and devDependencies
  # Matches: "package-name": "any-version" and replaces with specific version
  sed -i "s/\"${PACKAGE_NAME}\": \"[^\"]*\"/\"${PACKAGE_NAME}\": \"^${VERSION}\"/g" package.json

  echo "[$pkg] Updated to version ^$VERSION"
done

echo "DONE | Force update completed successfully!"
