#!/bin/sh

echo "START | Clean up ..."

rm -rf mcp-server/dist *.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "DONE | Clean up completed successfully!"
