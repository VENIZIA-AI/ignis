---
title: A `_name` Variable May Name an Omitted Value
description: "The dev-configs naming-convention and no-unused-vars rules accept a variable named with a leading underscore, such as { page: _page, ...rest }, while still checking its case."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-18

## A `_name` variable may name an omitted value

<Badge type="tip" text="Enhancement" />

**In one line.** `const { page: _page, ...rest } = query;` passes lint without a local override.

## What changed

- **`NamingConventionRule`** allows a variable whose name starts with `_` followed by more characters. The rest must still be camelCase, UPPER_CASE or PascalCase (`_bad_name` still fails).
- **`NoUnusedVarsRule`** defaults `varsIgnorePattern` to `^_`, so the omitted value is not reported as unused. Pass your own pattern to change it.

## Who is affected

- **Projects that kept a local selector for this.** Delete it.
- **Everyone else.** One more name shape allowed; nothing new fails.
