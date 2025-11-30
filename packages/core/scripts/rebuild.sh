#!/bin/sh

provision_opt=$1
case "$provision_opt" in
"no-version")
  echo "No versioning for current build!"
  ;;
*)
  npm version $provision_opt
  ;;
esac

echo "\nCleaning up resources ..."
bun run clean

echo "\nBuilding latest release..."
bun run build

echo "\nPLEASE PUSH LATEST BUILT FOR ANY CHANGE(S)"
