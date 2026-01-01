#!/bin/sh

echo "START | Building application..."

bun run docs:clean

vitepress build site

echo "DONE | Build completed successfully!"
