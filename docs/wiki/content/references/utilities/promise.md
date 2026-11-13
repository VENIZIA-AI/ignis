---
title: Promise Utility
description: Concurrency-limited task execution plus small Promise and error helpers
difficulty: beginner
lastUpdated: 2026-10-30
---

# Promise Utility

`PromiseUtility` and `ErrorUtility` are static-method classes for working with Promises - sleeping, bounding concurrency, firing-and-forgetting async work safely, and normalizing thrown values. `isPromiseLike` stays a function, because a type guard needs a positional parameter to narrow.

The old function names (`sleep`, `executePromiseWithLimit`, `voidExecution`, `toError`, `getDeepProperty`) are removed; `devz codemod namespace-functions` moves your calls.

## In one example

```typescript
import { PromiseUtility } from '@venizia/ignis-helpers';

const tasks = [
  () => PromiseUtility.sleep({ ms: 1000 }).then(() => 'Task 1 done'),
  () => PromiseUtility.sleep({ ms: 500 }).then(() => 'Task 2 done'),
  () => PromiseUtility.sleep({ ms: 1200 }).then(() => 'Task 3 done'),
];

const results = await PromiseUtility.executeWithLimit({
  tasks,
  limit: 2,
  onTaskDone: ({ result }) => console.log('A task finished:', result),
});
```

## Methods

| Method | What it does |
|--------|--------------|
| `PromiseUtility.sleep` | Resolves after `ms` milliseconds |
| `PromiseUtility.executeWithLimit` | Runs `tasks` with at most `limit` running concurrently |
| `PromiseUtility.voidExecution` | Fire-and-forget: routes a rejection to the logger |
| `ErrorUtility.toError` | Normalizes a `catch`-block value into an `Error` |
| `ParseUtility.getDeepProperty` | Reads a dot-separated `path` off `source` |
| `isPromiseLike` | Type guard: `true` when `value` has a callable `.then` |

### Signatures

```typescript
PromiseUtility.sleep({ ms }: { ms: number }): Promise<unknown>;

PromiseUtility.executeWithLimit<T>(opts: {
  tasks: Array<() => Promise<T>>;
  limit: number;
  onTaskDone?: <R>(opts: { result: R }) => ValueOrPromise<void>;
}): Promise<T[]>;

PromiseUtility.voidExecution(opts: {
  logger?: ILogger;
  scope: string;
  execution: ValueOrPromise<unknown>;
}): void;

ErrorUtility.toError({ error }: { error: unknown }): Error;

ParseUtility.getDeepProperty<T, V>(opts: { source: T; path: string }): V;

isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T>;
```

### Behavior

- **`executeWithLimit`** calls `onTaskDone` each time the limit is hit and a slot frees up. It throws if `limit` is not a positive integer.
- **`voidExecution`** routes a rejection of `execution` to `logger.for(scope).error(...)`, or to `console.error` without a logger, instead of an unhandled rejection. Synchronous values pass through untouched.
- **`ErrorUtility.toError`** passes an existing `Error` through and wraps anything else in an `ApplicationError` carrying `String(error)`.
- **`ParseUtility.getDeepProperty`** throws if any intermediate segment is `null` or `undefined`. See [Parse Utility](/references/utilities/parse).
- **`isPromiseLike`** stays a function, not a static method.

## Notes

- **`executeWithLimit` validates `limit` eagerly** - a non-integer or a value below `1` throws immediately, before any task runs.
- **`onTaskDone` only fires under backpressure.** It runs when the number of in-flight tasks reaches `limit` and `Promise.race` resolves one of them - not after every task.
- **`voidExecution` is not a `BaseHelper` member** because `BaseHelper` cannot carry `protected` members on classes the container instantiates anonymously (TS4094). It is a static on its own class so factory-built controllers can still use it.
- **`getDeepProperty` throws, it does not return `undefined`**, on a missing intermediate segment - wrap the call if you need optional-path semantics instead.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Timing](/references/utilities/#timing) - `PromiseUtility.sleep`, used to build the tasks in the example above

**Files:**

- [`packages/helpers/src/utilities/promise.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/promise.utility.ts)
- [`packages/helpers/src/utilities/error.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/error.utility.ts)
