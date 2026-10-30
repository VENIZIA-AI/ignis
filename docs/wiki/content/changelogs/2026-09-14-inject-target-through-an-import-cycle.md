---
title: A Dependency Reached Through An Import Cycle Can Still Name Its Class
description: "@inject({ target }) takes a function returning the class, so a class a barrel makes unreachable at module load is still nameable."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-09-14

## A dependency reached through an import cycle can still name its class

<Badge type="tip" text="Feature" />

**In one line.** `@inject({ target })` accepts a function that returns the class, and the function runs at resolve time.

```ts
@inject({ target: () => TaxOnboardingService })
private readonly taxOnboardingService: TaxOnboardingService
```

## What changed

- **The function form.** It fixes `ReferenceError: Cannot access 'X' before initialization`, which a barrel with a circular import causes. `@inject({ target: Class })` stays the default; use the function form only where a barrel makes the class unreachable at module load.
- **The type annotation must move too.** `emitDecoratorMetadata` turns the annotation into a second, eager reference. Import the class twice, once as a value for the function and once as a type for the annotation:

```ts
import { NoteService } from './index';
import type { NoteService as TNoteService } from './index';

constructor(@inject({ target: () => NoteService }) readonly noteService: TNoteService) {}
```

- **`@inject({ key })` dies on the same cycle**, for the same `emitDecoratorMetadata` reason.
- **No async form.** `Container.instantiate` is synchronous, and the target is only read to look up a binding key, so there is nothing to await.
- **Resolver types moved.** `TResolver`, `TAsyncResolver`, `TValueOrResolver`, `TValueOrAsyncResolver`, `resolveValue` and `resolveValueAsync` now live in `@venizia/ignis-inversion`. `@venizia/ignis-helpers/common` re-exports all six, so existing imports keep working.

## Who is affected

- **You use `@inject({ key })` or `@inject({ target: Class })`.** Nothing.
- **You worked around a circular-import crash by deep-importing.** The function form plus a type-only annotation replaces the workaround.
- **You import a resolver type from `@venizia/ignis-helpers/common`.** Nothing.
