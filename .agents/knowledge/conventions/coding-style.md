---
type: Convention
title: Coding style
description: Hard style rules that apply to every file in the monorepo.
resource: packages/core/src
tags: [conventions, style]
---

These are hard rules, not suggestions. A change that violates one of these should be called out in
review, not waved through.

## No silent catch

Every `catch` block logs. `BullMqQueueHelper.close`
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

Guard clauses at the top of a function, not a pyramid of nested `if`:

```typescript
if (!instance) {
  this.logger.for(this.stop.name).info('Server was not started | Nothing to stop');
  return;
}
```

## switch + default over if-else chains

`AbstractApplication.start`/`.stop` (`packages/core/src/base/applications/abstract.ts`) dispatch on
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

## Comments state constraints, not history or narration

A comment earns its place only by stating something the code cannot show: an invariant, a
non-obvious constraint, why a shortcut is safe. Not a changelog entry, not a restatement, not a
note to a reviewer.

## Related

- [Error handling](/conventions/error-handling.md)
- [Options objects](/conventions/options-objects.md)
- [Testing conventions](/conventions/testing-conventions.md)
- [Gotchas](/conventions/gotchas.md)
