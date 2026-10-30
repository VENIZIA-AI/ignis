---
title: IGNIS Preset Adds a Shared Package Kind
description: "@venizia/ignis adds a shared preset kind, so vulcan add --preset ignis --shared common makes a package that backend and frontend apps both import."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-31

## A shared package kind in the IGNIS preset

<Badge type="tip" text="New Feature" />

**In one line.** With a VULCAN that has `--shared` (0.4.9-0 or later), `vulcan add --preset ignis --shared common` makes a package of plain TypeScript that your backend and your frontend apps both import.

## What changed

- **A third kind next to `app` and `lib`.** The `shared` kind makes a side-neutral package: no framework in its dependencies and no framework import in its code, so a frontend can use it as safely as a backend.
- **It does not replace `lib`.** The `lib` kind is still the way to make a library that uses IGNIS (a service a backend app binds). Use `shared` for code both sides need: types, constants, validation, pure helpers.
- **A starter you can run.** The package comes with a tsconfig that does not enable decorators or the DOM, a first class with a test, and the same lint and format setup as your other packages.

## How to use it

```bash
bun x --no-install vulcan add --preset ignis --shared common
```

## Who is affected

- **Projects on an older VULCAN.** No action needed: the new kind is ignored there. Update `@venizia/vulcan` to 0.4.9-0 or later to use it.
- **Projects with libraries made by `--lib`.** No action needed: the `lib` kind is unchanged.
