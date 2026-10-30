---
title: noImplicitAny Is On in dev-configs, and Sibling Packages Pin Each Other Exactly
description: "Projects on @venizia/dev-configs now compile with noImplicitAny, and installing one IGNIS package always brings the sibling versions released with it."
packages: ['@venizia/dev-configs', '@venizia/ignis']
---

# Changelog - 2026-10-18

## noImplicitAny is on, and sibling packages pin each other exactly

<Badge type="warning" text="Behavior Change" />

**In one line.** Projects on `@venizia/dev-configs` compile with `noImplicitAny`, and installing one IGNIS package always brings the siblings released with it.

## What changed

- **`noImplicitAny` is on in `tsconfig.base.json`.** Callback parameters that editors used to show as `any` now infer, and only real gaps fail.
- **`useUnknownInCatchVariables` is on too.** A `catch (error)` variable is `unknown`, so narrow it before reading `error.message`. `strictPropertyInitialization` stays off.
- **Siblings are pinned exactly.** IGNIS packages now depend on the exact version of each sibling released with them, not a `^` range. Other dependencies keep a caret.

## Who is affected

- **Projects on `@venizia/dev-configs`.** Code with implicit `any` fails to compile, and `noEmitOnError` stops the emit. Fix the reported spots before upgrading dev-configs - add a type annotation, give a `reduce` its generic, read string keys through `Object.entries` - or set `"noImplicitAny": false` in the project's own tsconfig while you do.
- **Installers of IGNIS packages.** A fresh install resolves the exact set that was released together.
