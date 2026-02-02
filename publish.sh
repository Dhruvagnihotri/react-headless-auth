#!/bin/bash
# Publish @headlesskits/react-headless-auth to npm
# Usage: export NPM_TOKEN="your-token-here" && ./publish.sh

set -e

if [ -z "$NPM_TOKEN" ]; then
    echo "❌ Error: NPM_TOKEN environment variable not set"
    echo "Usage: export NPM_TOKEN=\"your-token-here\" && ./publish.sh"
    exit 1
fi

echo "🚀 Publishing @headlesskits/react-headless-auth to npm..."
echo ""

# Auto-increment version
echo "📈 Auto-incrementing version..."
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Parse version (major.minor.patch)
IFS='.' read -r -a parts <<< "$CURRENT_VERSION"
MAJOR="${parts[0]}"
MINOR="${parts[1]}"
PATCH="${parts[2]}"

# Increment patch version
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

echo "New version: $NEW_VERSION"
echo ""

# Update package.json version
echo "📝 Updating package.json version..."
npm version $NEW_VERSION --no-git-tag-version
echo ""

# Build the package
echo "🔨 Building package..."
npm run build
echo ""

# Configure npm authentication
echo "🔑 Configuring npm authentication..."
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
echo ""

# Publish to npm
echo "📤 Publishing to npm..."
npm publish --access public
echo ""

# Clean up .npmrc
rm -f .npmrc

echo "✅ Successfully published @headlesskits/react-headless-auth v${NEW_VERSION}!"
echo "🔗 View at: https://www.npmjs.com/package/@headlesskits/react-headless-auth/v/${NEW_VERSION}"
