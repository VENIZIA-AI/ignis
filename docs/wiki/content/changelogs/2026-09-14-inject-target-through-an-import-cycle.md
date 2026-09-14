---
title: A Dependency Reached Through An Import Cycle Can Still Name Its Class
description: "@inject({ target }) takes a function returning the class. The function runs when the container resolves, so a class a barrel makes unreachable at module load is still nameable."
---

# Changelog - 2026-09-14

## A dependency reached through an import cycle can still name its class

<Badge type="tip" text="Feature" />

**In one line.** `@inject({ target })` accepts a function that returns the class, and the function
runs at resolve time.

```ts
@inject({ target: () => TaxOnboardingService })
private readonly taxOnboardingService: TaxOnboardingService
```

`@inject({ target: TaxOnboardingService })` is unchanged and stays the default. Reach for the
function form only where a barrel makes the class unreachable at module load.

## The failure it answers

A barrel re-exports two modules and one imports the other back. The module the barrel evaluates
first reads a class that is still in its temporal dead zone:

```
ReferenceError: Cannot access 'TaxOnboardingService' before initialization
```

That error comes from the module system, before `inject` is ever called, so the framework cannot
name the decorator, the class, or the parameter. The only fix available today is to abandon the
barrel and deep-import - which works only when both files are yours.

## The annotation has to move too

The thunk covers the decorator argument. It does not cover the type annotation, because
`emitDecoratorMetadata` turns that annotation into a second, eager value reference:

```js
__legacyMetadataTS('design:paramtypes', [typeof NoteService === 'undefined' ? Object : NoteService]);
```

`typeof` on a binding in the temporal dead zone throws too, so TypeScript's own guard does not help.
Import the class twice - once as a value for the thunk, once as a type for the annotation:

```ts
import { NoteService } from './index';
import type { NoteService as TNoteService } from './index';

constructor(@inject({ target: () => NoteService }) readonly noteService: TNoteService) {}
```

Worth knowing even if you never use the thunk: **`@inject({ key })` dies on the same cycle**, for the
same reason. The plural spelling of the problem is `emitDecoratorMetadata`, not the class form.

## There is no async form, on purpose

`Container.instantiate` is synchronous and ends in `new cls(...args)`. An async resolver would make
it async, then `get()` async, then every `@inject` site async. The target is only read to look up a
binding key recorded on the class, so there is nothing to await.

## The resolver vocabulary moved down a layer

`TResolver`, `TAsyncResolver`, `TValueOrResolver`, `TValueOrAsyncResolver`, `resolveValue` and
`resolveValueAsync` now live in `@venizia/ignis-inversion`, beside the container that branches on
them. `@venizia/ignis-helpers/common` re-exports all six, so every existing import keeps working and
there is one declaration instead of two.

## Who is affected

**You use `@inject({ key })` or `@inject({ target: Class })`.** Nothing. Both are unchanged.

**You hit a circular-import crash and worked around it by deep-importing.** The thunk plus a
type-only annotation replaces the workaround.

**You import a resolver type from `@venizia/ignis-helpers/common`.** Nothing. The names and shapes
are identical.

**Files:**

- [`packages/inversion/src/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts) - `resolveValue`, `resolveValueAsync`, `resolveInjectTarget`
- [`packages/inversion/src/modules/container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts) - `Container.resolveBindingKey`
- [`packages/inversion/src/modules/metadata/injectors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/metadata/injectors.ts) - `TInjectOptions`
