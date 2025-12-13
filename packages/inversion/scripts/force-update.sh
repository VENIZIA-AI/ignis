#!/bin/bash

# Usage: ./force-update.sh [latest|next]
# Default: latest

TAG="${1:-latest}"

if [ "$TAG" != "latest" ] && [ "$TAG" != "next" ]; then
  echo "ERROR | Invalid tag: $TAG (must be 'latest' or 'next')"
  exit 1
fi

echo "START | Force updating from NPM registry (tag: $TAG)..."

# Packages to update from NPM (not workspace)
PACKAGES="@venizia/dev-configs"

for pkg in $PACKAGES; do
  echo "[$pkg] Fetching $TAG version..."

  # Get version for specific tag from npm registry
  VERSION=$(npm view "$pkg" dist-tags."$TAG" 2>/dev/null)

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
