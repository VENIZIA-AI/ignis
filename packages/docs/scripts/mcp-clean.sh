#!/bin/sh

echo "Clean up ...START"

rm -rf mcp-server/dist *.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "Clean up ...DONE"
