---
title: Performance Utility
description: Checkpoint-based timing and a logging wrapper for measuring execution duration
difficulty: beginner
lastUpdated: 2026-10-30
---

# Performance Utility

`PerformanceUtility` measures and logs how long a code block takes to run, built on `performance.now()` (millisecond resolution). `BaseApplication` uses `PerformanceUtility.executeWithMeasure` internally to time component, controller, and datasource registration during startup.

The old function names (`executeWithPerformanceMeasure`, `getPerformanceCheckpoint`, `getExecutedPerformance`) are still exported as deprecated aliases. They are removed in 0.5; `devz codemod namespace-functions` moves your calls.

## In one example

```typescript
import { PerformanceUtility } from '@venizia/ignis-helpers';

await PerformanceUtility.executeWithMeasure({
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

## Methods

| Method | Old name | Signature | What it does |
|--------|----------|-----------|---------------|
| `PerformanceUtility.executeWithMeasure` | `executeWithPerformanceMeasure` | `executeWithMeasure<R>(opts: { logger?: ILogger; level?: string; description?: string; args?: any; scope: string; task: Function }): Promise<R>` | Runs `task` (sync or async), logging a `START` line before and a `DONE` line after with the elapsed time. Resolves to whatever `task` returns. |
| `PerformanceUtility.getCheckpoint` | `getPerformanceCheckpoint` | `getCheckpoint(): number` | Returns `performance.now()` - a starting timestamp to pass to `getExecuted`. |
| `PerformanceUtility.getExecuted` | `getExecutedPerformance` | `getExecuted(opts: { from: number; digit?: number }): number` | Elapsed milliseconds since `from`, rounded to `digit` places (default `6`). |

## Notes

- **Defaults:** `logger` falls back to `console`, `level` to `'debug'`, `description` to `'Executing'`.
- **`args`, when provided, are logged as JSON (`%j`)** on both the `START` and `DONE` lines - handy for correlating a specific call's timing.
- **`task` is wrapped in `Promise.resolve()`**, so a plain synchronous function works exactly like an `async` one.
- **Prefer the checkpoint pair for granular, multi-point measurements** inside a single function, where wrapping the whole thing in `executeWithMeasure` would not isolate the segment you care about.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Logger](/extensions/helpers/logger/) - the `ILogger` type accepted by `PerformanceUtility.executeWithMeasure`

**Files:**

- [`packages/helpers/src/utilities/performance.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/performance.utility.ts)
