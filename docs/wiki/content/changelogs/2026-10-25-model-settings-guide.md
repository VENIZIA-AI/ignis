---
title: A Guide to Model Settings
description: "One guide page walks a multi-merchant Product through every @model setting: hiddenProperties, query, access with its write guard, limits and authorize. No code changes."
packages: []
---

# Changelog - 2026-10-25

## A guide to model settings

<Badge type="tip" text="Enhancement" />

**In one line.** [Model Settings](/guides/core-concepts/persistent/model-settings) replaces a search across a dozen pages with one teaching page for `@model({ settings })`.

## What changed

- **One running example.** A multi-merchant `Product` with `costPrice`, `merchantId` and `isDeleted` shows each setting in turn: `hiddenProperties`, `query.filter`, `access` (`resolve`, `onMissing`, `write.mode`, `write.sharedRows`, `columns`), `query.limit` and `authorize.principal`.
- **Tables for the decisions.** The three outcomes of `resolve()`, the cases of the write guard, read versus write permission for shared rows, the errors you will see, and a "which setting do I need" quick guide.
- **A migration section** for the old flat keys, which are removed in 0.4.3.
- **Every code sample is compiled** against the current packages.

## Who is affected

Everyone who declares a model. No action needed.
