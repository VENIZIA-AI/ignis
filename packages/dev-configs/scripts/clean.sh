#!/bin/bash
set -e

echo "Cleaning @venizia/dev-configs..."

rm -rf dist *.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "Clean completed!"
