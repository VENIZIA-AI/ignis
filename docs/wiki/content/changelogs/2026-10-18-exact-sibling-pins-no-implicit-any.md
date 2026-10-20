---
title: noImplicitAny Is On in dev-configs, and Sibling Packages Pin Each Other Exactly
description: "@venizia/dev-configs' base tsconfig turns noImplicitAny on, so editors infer the callback parameters they used to show as any. A release now pins the packages of this repository to each other's exact version."
packages: ['@venizia/dev-configs', '@venizia/ignis']
---

# Changelog - 2026-10-18

## noImplicitAny is on, and sibling packages pin each other exactly

<Badge type="warning" text="Behavior Change" />

**In one line.** Projects on `@venizia/dev-configs` compile with `noImplicitAny`, and installing one IGNIS package always brings the siblings released with it.

## What changed

- **`noImplicitAny` is on in `tsconfig.base.json`.** With it off, TypeScript gives up inferring the callback parameters of a method called on a union of array types (`Object.values(index).flatMap(classes => classes.map(target => ...))`), and editors flag hundreds of `implicitly has an 'any' type` hints that the compiler never reports. With it on, those parameters infer, and only real gaps fail.
- **`useUnknownInCatchVariables` is on too.** A `catch (error)` variable is `unknown`, so code narrows it before reading `error.message`. `strictPropertyInitialization` stays off: a property injected by a DI decorator has no initializer.
- **Siblings are pinned exactly.** A release wrote `^x.y.z` for the packages of this repository, so a project pinning one package could install the next release's sibling - and a breaking prerelease change with it. The repository's manifests now name each sibling `workspace:*`: `bun publish` writes the sibling's exact version into the tarball, and development keeps linking the workspace copy. Other dependencies keep a caret.

## Who is affected

- **Projects on `@venizia/dev-configs`.** Code with implicit `any` fails to compile, and `noEmitOnError` stops the emit. Fix the reported spots before upgrading dev-configs - add a type annotation, give a `reduce` its generic, read string keys through `Object.entries` - or set `"noImplicitAny": false` in the project's own tsconfig while you do.
- **Installers of IGNIS packages.** A fresh install resolves the exact set that was released together.

**Files:** [`packages/dev-configs/src/tsconfig/tsconfig.base.json`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/dev-configs/src/tsconfig/tsconfig.base.json), [`packages/core-server/package.json`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/core-server/package.json)
