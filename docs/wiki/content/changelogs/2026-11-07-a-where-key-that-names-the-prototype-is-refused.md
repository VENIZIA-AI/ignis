---
title: A where key that names the prototype is refused
description: "A where, order or update key named __proto__, constructor or prototype answers 400 Column NOT FOUND, like any other unknown column."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## A where key that names the prototype is refused

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** A filter key named `__proto__`, `constructor` or `prototype` names no column. It answers `400 Column NOT FOUND` like any unknown column, and can no longer act on the merged filter object.

## What changed

- **Refused with 400.** A `where` key of one of these names, on a read or on a write that selects rows (`updateBy`, `deleteBy`, `count`), answers `Column NOT FOUND`, also inside `and`, `or` and an include's `scope.where`.
- **Merge.** When the model has a default filter, the merge of the default and the caller's `where` no longer assigns such a key onto the merged object: it refuses it first.
- **Own columns only.** The column lookup of `where`, `order` and update data reads the table's own columns, so an inherited name such as `toString` is never taken for a column.
- **Unchanged.** Every real column, a JSON path, and the operators.

## Who is affected

Nobody needs to act. A client that sent one of these keys was sending a key that matches no column.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/relational/core/repositories/dialect/update.ts` | connectors |
