---
title: "@venizia/ignis-boot/auto"
description: "Every export of @venizia/ignis-boot/auto, from the built declarations (generated)."
---

# `@venizia/ignis-boot/auto`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

1 exports, 1 with TSDoc.

## `default`

*const*

The application's own decorated classes, found by the scanner - pass it in `configs.artifacts`. From source the run-time plugin builds the index when artifacts are registered; in a binary built with `IgnisArtifactsPlugin` this module is replaced by one carrying the built index.

```ts
declare const AutoArtifacts: AutoArtifactGroup;
```

Source: `packages/boot/src/bun/auto.ts`
