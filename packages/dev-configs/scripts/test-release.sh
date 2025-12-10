#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODULE="dev-configs"
PACKAGE_NAME="@venizia/dev-configs"
BUILD_MODE="${1:-patch}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Release Simulation${NC}"
echo -e "${BLUE}  Module: $PACKAGE_NAME${NC}"
echo -e "${BLUE}  Build Mode: $BUILD_MODE${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Navigate to package directory
cd "$(dirname "$0")/.."
echo -e "${YELLOW}📁 Working directory: $(pwd)${NC}"
echo ""

# Step 1: Clean previous build
echo -e "${BLUE}[1/8] Cleaning previous build...${NC}"
sh ./scripts/clean.sh
echo -e "${GREEN}✅ Clean completed${NC}"
echo ""

# Step 2: Build package
echo -e "${BLUE}[2/8] Building package...${NC}"
sh ./scripts/build.sh
echo -e "${GREEN}✅ Build completed${NC}"
echo ""

# Step 3: Validate build artifacts
echo -e "${BLUE}[3/8] Validating build artifacts...${NC}"

validate_artifact() {
  local file=$1
  local description=$2

  if [ ! -e "$file" ]; then
    echo -e "${RED}❌ Error: $description not found at: $file${NC}"
    exit 1
  fi
  echo -e "${GREEN}   ✓ $description${NC}"
}

validate_artifact "dist" "dist directory"
validate_artifact "dist/index.js" "dist/index.js"
validate_artifact "dist/index.d.ts" "dist/index.d.ts"
validate_artifact "tsconfig/tsconfig.base.json" "tsconfig.base.json"
validate_artifact "tsconfig/tsconfig.common.json" "tsconfig.common.json"
validate_artifact "prettier/.prettierignore" ".prettierignore"

echo -e "${GREEN}✅ All build artifacts validated${NC}"
echo ""

# Step 4: Validate package.json
echo -e "${BLUE}[4/8] Validating package.json...${NC}"
if ! jq empty package.json 2>/dev/null; then
  echo -e "${RED}❌ Error: Invalid package.json${NC}"
  exit 1
fi

CURRENT_VERSION=$(jq -r .version package.json)
echo -e "${GREEN}   ✓ Current version: $CURRENT_VERSION${NC}"
echo -e "${GREEN}✅ package.json is valid${NC}"
echo ""

# Backup package.json before version bump simulation
cp package.json package.json.backup

# Step 5: Simulate version bump
echo -e "${BLUE}[5/8] Simulating version bump...${NC}"

# Calculate new version by actually bumping it, then we'll restore it
if command -v npm &> /dev/null; then
  # Map prerelease modes to regular version bumps
  case "$BUILD_MODE" in
    prepatch)
      npm version patch --no-git-tag-version > /dev/null 2>&1 || true
      ;;
    preminor)
      npm version minor --no-git-tag-version > /dev/null 2>&1 || true
      ;;
    premajor)
      npm version major --no-git-tag-version > /dev/null 2>&1 || true
      ;;
    prerelease)
      npm version patch --no-git-tag-version > /dev/null 2>&1 || true
      ;;
    *)
      npm version $BUILD_MODE --no-git-tag-version > /dev/null 2>&1 || true
      ;;
  esac

  NEW_VERSION=$(jq -r .version package.json)

  if [ -z "$NEW_VERSION" ] || [ "$NEW_VERSION" = "null" ]; then
    echo -e "${YELLOW}   ⚠ Could not calculate new version, using placeholder${NC}"
    NEW_VERSION="X.Y.Z"
  fi
else
  echo -e "${YELLOW}   ⚠ npm not found, using placeholder version${NC}"
  NEW_VERSION="X.Y.Z"
fi

echo -e "${GREEN}   ✓ Would bump: $CURRENT_VERSION → $NEW_VERSION${NC}"
echo -e "${GREEN}✅ Version bump simulation completed${NC}"
echo ""

# Step 6: Simulate git operations
echo -e "${BLUE}[6/8] Simulating git operations (dry-run)...${NC}"

TAG_NAME="dev-configs-v$NEW_VERSION"
echo -e "${GREEN}   ✓ Would create tag: $TAG_NAME${NC}"

# Determine npm tag
case "$BUILD_MODE" in
  prepatch|preminor|premajor|prerelease)
    NPM_TAG="next"
    ;;
  *)
    NPM_TAG="latest"
    ;;
esac

echo -e "${GREEN}   ✓ Would commit to develop branch${NC}"
echo -e "${GREEN}   ✓ Would push tag: $TAG_NAME${NC}"

case "$BUILD_MODE" in
  pre*)
    # Skip merge to main for pre-releases
    ;;
  *)
    echo -e "${GREEN}   ✓ Would merge to main branch (stable release)${NC}"
    ;;
esac

echo -e "${GREEN}✅ Git operations simulation completed${NC}"
echo ""

# Step 7: Simulate NPM publish
echo -e "${BLUE}[7/8] Simulating NPM publish (dry-run)...${NC}"
echo -e "${GREEN}   ✓ Would publish: $PACKAGE_NAME@$NEW_VERSION${NC}"
echo -e "${GREEN}   ✓ Would use npm tag: $NPM_TAG${NC}"

# Show what would be published
echo -e "${YELLOW}   📦 Package contents that would be published:${NC}"
ls -1 dist/ | sed 's/^/      - dist\//'
ls -1 tsconfig/ | sed 's/^/      - tsconfig\//'
echo "      - prettier/.prettierignore"

echo -e "${GREEN}✅ NPM publish simulation completed${NC}"
echo ""

# Summary
# Restore package.json to original version
echo -e "${BLUE}[8/8] Restoring original package.json...${NC}"
if [ -f "package.json.backup" ]; then
  mv package.json.backup package.json
  echo -e "${GREEN}✅ Version restored to: $CURRENT_VERSION${NC}"
else
  echo -e "${YELLOW}⚠️  Backup not found, skipping restore${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Simulation Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Current Version:${NC} $CURRENT_VERSION"
echo -e "${GREEN}New Version:${NC}     $NEW_VERSION"
echo -e "${GREEN}Build Mode:${NC}      $BUILD_MODE"
echo -e "${GREEN}Git Tag:${NC}         $TAG_NAME"
echo -e "${GREEN}NPM Tag:${NC}         $NPM_TAG"
echo -e "${GREEN}Package Name:${NC}    $PACKAGE_NAME"
echo ""
echo -e "${YELLOW}⚠️  This was a dry-run simulation!${NC}"
echo -e "${YELLOW}   No actual changes were made to:${NC}"
echo -e "${YELLOW}   - package.json version${NC}"
echo -e "${YELLOW}   - git repository${NC}"
echo -e "${YELLOW}   - npm registry${NC}"
echo ""
echo -e "${GREEN}✅ All checks passed! Ready for release.${NC}"
echo ""
echo -e "${BLUE}To perform actual release:${NC}"
echo -e "   1. Go to GitHub Actions"
echo -e "   2. Select '[dev-configs] NPM Release' workflow"
echo -e "   3. Click 'Run workflow'"
echo -e "   4. Choose build_mode: ${BUILD_MODE}"
echo -e "${BLUE}========================================${NC}"
