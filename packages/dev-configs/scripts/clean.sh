#!/bin/bash

echo "START | Clean up ..."

rm -rf dist *.tsbuildinfo .configs/*.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "DONE | Clean up completed successfully!"
