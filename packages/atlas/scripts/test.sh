#!/bin/sh

current_branch=$(git branch --show-current)

case $current_branch in
"develop" | "main")
  echo "[hooks][pre-commit] SKIP Linting application"
  ;;
*)
  echo "[hooks][pre-commit] Linting application"
  bun run lint
  ;;
esac
