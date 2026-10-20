#!/bin/sh

echo "START | Clean up ..."

rm -rf site/.vitepress/dist
rm -rf site/.vitepress/cache

echo "DONE | Clean up completed successfully!"
