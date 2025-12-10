# Performance Utility

The Performance utility provides functions for measuring and logging the execution time of code blocks, which is useful for identifying bottlenecks and optimizing your application.

## `executeWithPerformanceMeasure`

This is a higher-order function that wraps a task (a function returning a Promise), automatically logging its start time, end time, and total execution duration.

### `executeWithPerformanceMeasure(opts)`

-   `opts` (object):
    -   `logger` (ApplicationLogger, optional): A logger instance to use for logging. Defaults to `console`.
    -   `description` (string, optional): A description of the task being measured.
    -   `scope` (string): A scope to identify the context of the measurement.
    -   `task` (Function): The asynchronous function (or a function that returns a Promise) to be executed and measured.

### Example

The `BaseApplication` uses this utility to measure the time taken to register components, controllers, and data sources during the startup process.

```typescript
// Inside BaseApplication class
import { executeWithPerformanceMeasure } from '@venizia/ignis';

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

## Low-Level Utilities

For more granular measurements, you can use the lower-level functions:

-   **`getPerformanceCheckpoint()`**: Returns a high-resolution timestamp, which you can use as a starting point.
-   **`getExecutedPerformance(opts)`**: Calculates the elapsed time in milliseconds since a given checkpoint.

### Example

```typescript
import { getPerformanceCheckpoint, getExecutedPerformance } from '@venizia/ignis';

const start = getPerformanceCheckpoint();

// ... perform some work

const duration = getExecutedPerformance({ from: start });
console.log(`The work took ${duration} ms.`);
```
