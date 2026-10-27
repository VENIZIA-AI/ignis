---
title: TSearchScopeResolver Is Exported
description: 'The search controllers entry now exports the TSearchScopeResolver type, so a constant holding the result of defineSearchController with a scope no longer fails with TS2883.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## TSearchScopeResolver is exported

<Badge type="info" text="Bug Fix" />

**In one line.** `const Base = SearchControllerFactory.defineSearchController({ ... })` failed to type-check with TS2883 ("the inferred type cannot be named") after the `scope` option was added, because the type of that option was not exported.

## What changed

- **`TSearchScopeResolver` is exported** from the search controllers entry (`@venizia/ignis/search/controllers`, `@venizia/ignis/typesense/controllers`, `@venizia/ignis-connectors/search/controllers`).

## Who is affected

Apps that keep the result of `defineSearchController` in a constant and build with declarations. They compile again; no code change is needed.
