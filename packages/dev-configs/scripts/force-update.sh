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

# Packages to update from NPM (not workspace)
PACKAGES="@minimaltech/eslint-node"

for pkg in $PACKAGES; do
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
