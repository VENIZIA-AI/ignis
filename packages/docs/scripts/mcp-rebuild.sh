#!/bin/sh

echo "\nCleaning up resources ..."
bun run mcp:clean

echo "\nBuilding latest release..."
bun run mcp:build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
