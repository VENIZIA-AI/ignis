---
title: Performance Utility
description: Checkpoint-based timing and a logging wrapper for measuring execution duration
difficulty: beginner
lastUpdated: 2026-07-16
---

# Performance Utility

Functions for measuring and logging how long a code block takes to run, built on `performance.now()` (millisecond resolution). `BaseApplication` uses `executeWithPerformanceMeasure` internally to time component, controller, and datasource registration during startup.

## In one example

```typescript
import { executeWithPerformanceMeasure } from '@venizia/ignis-helpers';

await executeWithPerformanceMeasure({
  logger: this.logger,
  scope: this.registerComponents.name,
  description: 'Register application components',
  task: async () => {
    // ... logic to register components
  },
});
```

```
[RegisterComponents] START | Register application components ...
[RegisterComponents] DONE | Register application components | Took: 12.3456 (ms)
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `executeWithPerformanceMeasure` | `executeWithPerformanceMeasure<R>(opts: { logger?: Logger; level?: string; description?: string; args?: any; scope: string; task: Function }): Promise<R>` | Runs `task` (sync or async), logging a `START` line before and a `DONE` line after with the elapsed time. Resolves to whatever `task` returns. |
| `getPerformanceCheckpoint` | `getPerformanceCheckpoint(): number` | Returns `performance.now()` - a starting timestamp to pass to `getExecutedPerformance`. |
| `getExecutedPerformance` | `getExecutedPerformance(opts: { from: number; digit?: number }): number` | Elapsed milliseconds since `from`, rounded to `digit` places (default `6`). |

## Notes

- **Defaults:** `logger` falls back to `console`, `level` to `'debug'`, `description` to `'Executing'`.
- **`args`, when provided, are logged as JSON (`%j`)** on both the `START` and `DONE` lines - handy for correlating a specific call's timing.
- **`task` is wrapped in `Promise.resolve()`**, so a plain synchronous function works exactly like an `async` one.
- **Prefer the checkpoint pair for granular, multi-point measurements** inside a single function, where wrapping the whole thing in `executeWithPerformanceMeasure` would not isolate the segment you care about.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Logger](/extensions/helpers/logger/) - the `Logger` type accepted by `executeWithPerformanceMeasure`

**Files:**

- [`packages/helpers/src/utilities/performance.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/performance.utility.ts)
