#!/bin/bash
echo "\nCleaning up resources ..."
bun run clean

echo "\nBuilding latest release..."
bun run build
