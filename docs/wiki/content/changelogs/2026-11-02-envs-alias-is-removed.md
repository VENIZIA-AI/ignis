---
title: The Envs alias is removed
description: "Envs, a second name for applicationEnvironment in @venizia/ignis-helpers, is removed; use applicationEnvironment, or AppEnvs, which stays."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-02

## The Envs alias is removed

<Badge type="warning" text="Breaking Change" />

**In one line.** Import `applicationEnvironment` (or `AppEnvs`) where you imported `Envs`; they are the same object.

## What changed

- **`Envs` is removed** from `@venizia/ignis-helpers`. It was the third name for the application environment singleton.
- **`applicationEnvironment` and `AppEnvs` stay.** Both are the same instance, with the same `get` and `isDevelopment` methods.

## Who is affected

- **Code that imports `Envs`.** It stops compiling.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Code that imports `Envs` fails to compile after the update.

**Before:**

```typescript
import { Envs } from '@venizia/ignis-helpers';

const port = Envs.get('APP_ENV_SERVER_PORT');
```

**After:**

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const port = applicationEnvironment.get('APP_ENV_SERVER_PORT');
```
