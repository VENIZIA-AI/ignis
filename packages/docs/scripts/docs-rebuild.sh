#!/bin/sh

echo "\nCleaning up resources ..."
bun run docs:clean

echo "\nBuilding latest release..."
bun run docs:build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
