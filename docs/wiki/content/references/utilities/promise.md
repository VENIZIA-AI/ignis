---
title: Promise Utility
description: Concurrency-limited task execution plus small Promise and object-path helpers
difficulty: beginner
lastUpdated: 2026-07-16
---

# Promise Utility

Helper functions for working with Promises - bounding concurrency, normalizing thrown values, type-guarding thenables, reading nested object paths, and firing-and-forgetting async work safely.

## In one example

```typescript
import { executePromiseWithLimit, sleep } from '@venizia/ignis-helpers';

const tasks = [
  () => sleep(1000).then(() => 'Task 1 done'),
  () => sleep(500).then(() => 'Task 2 done'),
  () => sleep(1200).then(() => 'Task 3 done'),
];

const results = await executePromiseWithLimit({
  tasks,
  limit: 2,
  onTaskDone: ({ result }) => console.log('A task finished:', result),
});
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `executePromiseWithLimit` | `executePromiseWithLimit<T>(opts: { tasks: Array<() => Promise<T>>; limit: number; onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void> }): Promise<T[]>` | Runs `tasks` with at most `limit` running concurrently. Calls `onTaskDone` each time the limit is hit and a slot frees up. Throws if `limit` is not a positive integer. |
| `toError` | `toError(error: unknown): Error` | Normalizes a `catch`-block value into an `Error` - passes an existing `Error` through, wraps anything else with `new Error(String(error))`. |
| `isPromiseLike` | `isPromiseLike<T>(value: T \| PromiseLike<T>): value is PromiseLike<T>` | Type guard: `true` when `value` is non-null and has a callable `.then`. |
| `getDeepProperty` | `getDeepProperty<T, V>(obj: T, path: string): V` | Reads a dot-separated `path` off `obj`. Throws if any intermediate segment is `null`/`undefined`. |
| `voidExecution` | `voidExecution(opts: { logger?: ILogger; scope: string; execution: ValueOrPromise<unknown> }): void` | Fire-and-forget: if `execution` is a Promise, routes a rejection to `logger.for(scope).error(...)` (or `console.error` without a logger) instead of an unhandled rejection. Synchronous values pass through untouched. |

## Notes

- **`executePromiseWithLimit` validates `limit` eagerly** - a non-integer or a value below `1` throws immediately, before any task runs.
- **`onTaskDone` only fires under backpressure.** It runs when the number of in-flight tasks reaches `limit` and `Promise.race` resolves one of them - not after every task.
- **`voidExecution` exists because `BaseHelper` cannot carry `protected` members** on classes the container instantiates anonymously (TS4094) - it is a standalone function, not a helper method, precisely so factory-built controllers can still use it.
- **`getDeepProperty` throws, it does not return `undefined`**, on a missing intermediate segment - wrap the call if you need optional-path semantics instead.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Date Utility](/references/utilities/date) - `sleep()`, used to build the tasks in the example above

**Files:**

- [`packages/helpers/src/utilities/promise.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/promise.utility.ts)
