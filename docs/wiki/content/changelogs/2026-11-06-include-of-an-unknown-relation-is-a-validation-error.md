---
title: An include of a name that is not a relation is a validation error
description: "toInclude looks relation names up on own properties only, so constructor or toString answers 400 Relation NOT FOUND instead of an internal error, and the message echoes the name escaped."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-06

## An include of a name that is not a relation is a validation error

<Badge type="info" text="Bug Fix" />

**In one line.** `include: ['constructor']` found an inherited function where a relation was expected and failed later as an internal error. It is a `400 Relation NOT FOUND` now.

## What changed

- **Own relations only.** A relation name is looked up on the declared relations, not on the object's prototype. `constructor`, `toString`, `__proto__` and similar names are not relations.
- **Escaped echo.** The not-found message writes the name through the same escaping the column messages use: one line, control characters as `\uXXXX`.

## Who is affected

Nobody needs to act. A request that used such a name was failing already, with a worse error.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
