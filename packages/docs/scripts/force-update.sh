#!/bin/bash

echo "START | Force updating from NPM registry..."

# Packages to update from NPM (not workspace)
PACKAGES="@venizia/dev-configs"

for pkg in $PACKAGES; do
  echo "[$pkg] Fetching latest version..."

  # Get latest version from npm registry
  LATEST_VERSION=$(npm view "$pkg" version 2>/dev/null)

  if [ -z "$LATEST_VERSION" ]; then
    echo "[$pkg] Could not fetch version, SKIP..."
    continue
  fi

  echo "[$pkg] Latest version: $LATEST_VERSION"

  # Escape package name for sed (replace @ and / with escaped versions)
  PACKAGE_NAME=$(echo "$pkg" | sed 's/[\/&]/\\&/g')

  # This handles both dependencies and devDependencies
  # Matches: "package-name": "any-version" and replaces with specific version
  sed -i "s/\"${PACKAGE_NAME}\": \"[^\"]*\"/\"${PACKAGE_NAME}\": \"^${LATEST_VERSION}\"/g" package.json

  echo "[$pkg] Updated to version ^$LATEST_VERSION"
done

echo "DONE | Force update completed successfully!"
