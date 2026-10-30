---
title: FilterSchema Has a Real Type, and IGNIS Compiles Under noImplicitAny
description: "FilterSchema and InclusionSchema are now typed zod schemas instead of any, so a schema that embeds them infers precisely."
packages: ['@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-18

## FilterSchema has a real type

<Badge type="warning" text="Type Change" />

**In one line.** `FilterSchema` and `InclusionSchema` were `any` in the emitted types and are now typed zod schemas.

## What changed

- **`FilterSchema` and `InclusionSchema` are typed.** A schema that embeds `FilterSchema` now infers `filter` as optional and precisely typed instead of a required `any`.
- **No implicit `any` left in IGNIS.** Every package compiles with `noImplicitAny` on. No behaviour changes.

## Who is affected

- **Code that relied on `FilterSchema` being `any`.** A value that does not match the filter shape is now a compile error where it used to pass silently. Fix the value or the schema it is assigned to.
- **Everyone else.** No change.
