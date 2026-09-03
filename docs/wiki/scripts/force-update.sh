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
PACKAGES="@venizia/dev-configs"

for pkg in $PACKAGES; do
  echo "[$pkg] Fetching $TAG version..."

  if [ "$TAG" = "highest" ]; then
    # Get the highest released version by semver sort
    # jq, not `grep '"' | tail -1`: with --json, npm prints its E404 body on STDOUT, so the old
    # pipe turned the error text into the "version" and handed it to sed. A package that is not
    # published yet must resolve to nothing, so the loop skips it. npm already returns versions
    # semver-sorted, and a package with exactly one version returns a bare string, not an array.
    VERSION=$(npm view "$pkg" versions --json 2>/dev/null | jq -r 'if type == "array" then .[-1] elif type == "string" then . else empty end')
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
