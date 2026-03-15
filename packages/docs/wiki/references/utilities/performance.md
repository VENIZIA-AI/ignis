# Performance Utility

The Performance utility provides functions for measuring and logging the execution time of code blocks, which is useful for identifying bottlenecks and optimizing your application. All timing uses `performance.now()` (milliseconds).

## `executeWithPerformanceMeasure`

This is a higher-order function that wraps a task (a function), automatically logging its start time, end time, and total execution duration. Returns a Promise that resolves to the task's return value.

### `executeWithPerformanceMeasure(opts)`

-   `opts` (object):
    -   `logger` (Logger, optional): A logger instance to use for logging. Defaults to `console`.
    -   `level` (string, optional): The log level to use (e.g., `'debug'`, `'info'`). Defaults to `'debug'`.
    -   `description` (string, optional): A description of the task being measured. Defaults to `'Executing'`.
    -   `scope` (string): A scope to identify the context of the measurement.
    -   `task` (Function): The function to be executed and measured. Can be sync or async (wrapped with `Promise.resolve()`).
    -   `args` (any, optional): Arguments to include in the log output for debugging purposes. When provided, they are logged as JSON (`%j` format).

### Example

The `BaseApplication` uses this utility to measure the time taken to register components, controllers, and data sources during the startup process.

```typescript
// Inside BaseApplication class
import { executeWithPerformanceMeasure } from '@venizia/ignis-helpers';

// ...

  async registerComponents() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        // ... logic to register components
      },
    });
  }
```

When `registerComponents` is called, it will produce log output similar to this:

```
[RegisterComponents] START | Register application components ...
[RegisterComponents] DONE | Register application components | Took: 12.3456 (ms)
```

With `args` provided:

```
[RegisterComponents] START | Register application components... | Args: {"name":"auth"}
[RegisterComponents] DONE | Register application components | Args: {"name":"auth"} | Took: 12.3456 (ms)
```

## Low-Level Utilities

For more granular measurements, you can use the lower-level functions:

-   **`getPerformanceCheckpoint()`**: Returns a high-resolution timestamp from `performance.now()`, which you can use as a starting point.
-   **`getExecutedPerformance(opts)`**: Calculates the elapsed time in milliseconds since a given checkpoint. Rounds to 6 decimal places by default.
    -   `opts.from` (number): The starting checkpoint from `getPerformanceCheckpoint()`.
    -   `opts.digit` (number, optional): Number of decimal places for rounding. Defaults to `6`.

### Example

```typescript
import { getPerformanceCheckpoint, getExecutedPerformance } from '@venizia/ignis-helpers';

const start = getPerformanceCheckpoint();

// ... perform some work

const duration = getExecutedPerformance({ from: start });
console.log(`The work took ${duration} ms.`);

// With custom precision
const preciseDuration = getExecutedPerformance({ from: start, digit: 2 });
console.log(`The work took ${preciseDuration} ms.`);
```
