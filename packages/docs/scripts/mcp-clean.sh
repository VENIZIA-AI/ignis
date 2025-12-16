#!/bin/sh

echo "START | Clean up ..."

rm -rf dist *.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "DONE | Clean up completed successfully!"
