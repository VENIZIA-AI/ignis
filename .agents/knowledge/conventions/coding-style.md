---
type: Convention
title: Coding style
description: Hard style rules that apply to every file in the monorepo.
resource: packages/core-server/src
tags: [conventions, style]
---

These are hard rules, not suggestions. A change that violates one of these should be called out in
review, not waved through.

## Verb prefixes

A function name opens with the verb that says what it does: `generate` `build` `to` `is` `has`
`assert` `extract` `enrich` `get` `resolve`.

`is*` and `assert*` answer the same question and differ in what happens next. `is*` returns a boolean
and leaves the branch to the caller; `assert*` throws and returns `void`, so the code after it needs
no branch. Reach for `assert*` when every caller would throw on `false` anyway - otherwise one
condition ends up with a different error message at each call site.

`has*` is the ownership question: `hasBucket`, never `hasBucket` - the second is not English.

This list covers UTILITY functions. Service and controller methods in a consuming application lean on
a wider set - `find`, `create`, `update`, `delete`, `validate`, `load`, `count` - measured across a
downstream repository, where `assert` alone appears 141 times. Do not force those into this list.

## No silent catch

Every `catch` block logs. `BullMQHelper.close`
(`packages/helpers/src/modules/queue/bullmq/helper.ts`) shows the pattern: close both connections
even if the first fails, but log each failure through the scoped logger before continuing:

```typescript
try {
  await this.worker?.close();
} catch (error) {
  this.logger.for(this.close.name).error('Error closing BullMQ worker: %s', error);
  failures.push(toError(error).message);
}
```

## Always use braces

No single-statement `if` without `{ }` - it removes a whole class of dangling-else bugs.

## Early return over nesting

Guard clauses at the top of a function, not a pyramid of nested `if`. `ServerApplication.stop`
(`packages/core-server/src/base/applications/server.ts`) bails out before touching the server instance:

```typescript
if (!instance) {
  this.logger.for(this.stop.name).info('Server was not started | Nothing to stop');
  return;
}
```

## switch + default over if-else chains

`ServerApplication.start`/`.stop` (`packages/core-server/src/base/applications/server.ts`) dispatch on
`this.server.runtime` with a `switch`, whose `default` throws via
[`getError`](/conventions/error-handling.md) rather than falling through silently:

```typescript
switch (this.server.runtime) {
  case RuntimeModules.BUN: { await this.startBunModule(); break; }
  case RuntimeModules.NODE: { await this.startNodeModule(); break; }
  default: { throw getError({ message: '[start] Invalid runtimeModule to start server instance!' }); }
}
```

## Strict TypeScript, avoid any

No `any` unless truly unavoidable. When a cast cannot be avoided, prefer a simple `as any` over a
baroque `as unknown as SomeType` - the simple cast is honest about being an escape hatch.

## State belongs to a class, not to the module

A `let`, a cache `Map` or a `WeakMap` at module scope with exported arrows reading it is state with
no owner: nothing names it, nothing bounds who may mutate it, and a test cannot reach it to reset
it. Put the state and the operations on it in a class, as `static` members - `HfLogRing`,
`PinoBackingLogger`, `TableColumnCache`, `DroppedRouteDecorators` are the shape.

Two limits on this. A pure exported function that holds nothing stays a function - a class around it
buys nothing. And a name that is already published stays exported, as a one-line delegate to the
class, the way `getError` delegates to `ApplicationError.getError`.

Inside a class, reach for statics by class name (`HfLogger.textEncoder`), not `this` - a static
called through a detached reference has no `this`.

## Comments state constraints, not history or narration

A comment earns its place only by stating something the code cannot show: an invariant, a
non-obvious constraint, why a shortcut is safe. Not a changelog entry, not a restatement, not a
note to a reviewer.

## Related

- [Error handling](/conventions/error-handling.md)
- [Options objects](/conventions/options-objects.md)
- [Testing conventions](/conventions/testing-conventions.md)
- [Gotchas](/conventions/gotchas.md)
