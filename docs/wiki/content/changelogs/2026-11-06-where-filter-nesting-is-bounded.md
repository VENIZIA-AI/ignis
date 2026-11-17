---
title: A where filter is limited to 20 levels of and / or nesting
description: "The where schema refuses a filter whose and / or groups nest deeper than 20 levels, before it is parsed. The limit is configurable with QuerySchemaFactory.build({ limits: { whereDepth } })."
packages: ['@venizia/ignis-filter']
---

# Changelog - 2026-11-06

## A where filter is limited to 20 levels of and / or nesting

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** The `where` schema had no depth limit and its cost grows with the square of the depth, so one request with a deeply nested `and` / `or` chain could occupy the event loop for a long time. A `where` nested deeper than 20 levels is now a validation issue, found before the schema walks it.

## What changed

- **A depth check first.** An iterative check measures the `and` / `or` nesting on the raw value and stops at the limit; a flat `where` is depth 1. Wide filters (many siblings) are not affected.
- **Where it applies.** The `where` of a filter, a `where` sent as a JSON string, the `where` of an `include` scope, and the search filters built from the same schema.
- **Configurable.** `QuerySchemaFactory.build({ limits: { whereDepth: 50 } })` changes the limit for the schemas it builds. The default is 20.

## Who is affected

- **Clients that send a filter nested deeper than 20 levels.** They get a validation error. Real filters stay in single digits.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/schemas/builder.ts` | filter |
| `src/schemas/where-depth.ts` | filter |
