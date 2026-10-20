# Utilities

Pure, standalone functions providing common, reusable logic for the IGNIS framework. All utilities are stateless and easy to use.

## Quick Reference

| Utility | Package | Purpose | Key Functions |
|---------|---------|---------|---------------|
| **Duration** | `ignis-helpers` | Duration units and conversion | `DurationUnits`, `DurationMultipliers.toMilliseconds()`, `.parseToMilliseconds()` |
| **JSX** | `ignis` | HTML/JSX responses | `htmlContent()`, `htmlResponse()` |
| **Module** | `ignis-helpers` | Optional peer loading | `ModuleUtility` |
| **Parse** | `ignis-helpers` | Data type conversion | `int()`, `float()`, `toBoolean()`, `toCamel()` |
| **Performance** | `ignis-helpers` | Execution timing | `executeWithPerformanceMeasure()`, `getPerformanceCheckpoint()` |
| **Promise** | `ignis-helpers` | Promise helpers | `executePromiseWithLimit()`, `isPromiseLike()`, `getDeepProperty()` |
| **Request** | `ignis-helpers` | HTTP utilities | `parseMultipartBody()`, `sanitizeFilename()`, `createContentDispositionHeader()` |
| **Retry** | `ignis-helpers` | Backoff-driven retries | `RetryHelper` |
| **Schema** | `ignis` | Zod schema helpers | `jsonContent()`, `jsonResponse()`, `requiredString()`, `idParamsSchema()` |
| **Statuses** | `ignis` | Status code constants | `Statuses`, `CommonStatuses`, `UserStatuses`, `RoleStatuses` |
| **Timing** | `ignis-helpers` | Pause and measure | `sleep()`, `hrTime()` |

Calendar dates - parsing, formatting, adding a month in a time zone - live in [`TemporalHelper`](/extensions/helpers/temporal/).

## What's in This Section

### Data Processing

- [**Parse**](./parse.md) - Functions for parsing and converting data types safely (integers, floats, booleans, camelCase, array-to-map)
- [**Schema**](./schema.md) - Helpers for creating Zod schemas for OpenAPI request/response validation
- [**Statuses**](./statuses.md) - Standardized status code constants for entity lifecycle management

### Time & Performance

- [**Timing**](#timing) - `sleep()` to pause, `hrTime()` to read a high-resolution clock
- [**Duration**](./duration.md) - A unit vocabulary, written-duration parsing, and conversion between units and milliseconds
- [**Performance**](./performance.md) - Utilities for measuring code execution time and performance profiling

### Async & HTTP

- [**JSX**](./jsx.md) - HTML and JSX response utilities for server-side rendering and OpenAPI documentation
- [**Promise**](./promise.md) - Helper functions for working with Promises including concurrency limiting and value transformation
- [**Request**](./request.md) - HTTP request utilities for parsing multipart form data and creating secure Content-Disposition headers
- [**Retry**](./retry.md) - Backoff-driven retry helpers on `RetryHelper` - error-triggered (`executeWithRetry`) and predicate-driven (`executeWithRetryUntil`)

### Runtime

- [**Module**](./module.md) - Utility for validating that required Node.js modules are installed at runtime

## Usage Pattern

Utilities are imported from `@venizia/ignis` (schema, JSX, and status helpers) or `@venizia/ignis-helpers` (runtime utilities):

```typescript
import { jsonContent, jsonResponse, htmlResponse, requiredString, Statuses } from '@venizia/ignis';
import { sleep, int, float, toBoolean } from '@venizia/ignis-helpers';

// Timing
await sleep(1000);

// Parse
const myInt = int('1,000'); // 1000
const myFloat = float('1,234.567', 2); // 1234.57
const myBool = toBoolean('true'); // true

// Schema (for OpenAPI JSON routes)
const responseSchema = jsonResponse({
  description: 'User data',
  schema: z.object({ id: z.string(), name: z.string() }),
});

// JSX (for HTML routes)
const htmlResponseSchema = htmlResponse({
  description: 'Dashboard page',
});

// Statuses
const order = { status: Statuses.COMPLETED };
if (Statuses.isCompleted(order.status)) {
  console.log('Order is complete');
}
```

## Timing

Two small functions with no page of their own. Both ship from the root of `@venizia/ignis-helpers`.

| Function | Signature | What it does |
|---|---|---|
| `sleep` | `sleep(ms: number): Promise<unknown>` | Resolves after `ms` milliseconds, through `setTimeout` |
| `hrTime` | `hrTime(): number` | Seconds from `process.hrtime()`, to nine decimals - for measuring, not for dates. Node and Bun only |

```typescript
import { hrTime, sleep } from '@venizia/ignis-helpers';

const startedAt = hrTime();
await sleep(250);
const elapsedSeconds = hrTime() - startedAt; // about 0.25
```

**Files:**

- [`packages/helpers/src/utilities/sleep.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/sleep.utility.ts) - `sleep`
- [`packages/helpers/src/utilities/hr-time.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/hr-time.utility.ts) - `hrTime`

> **Related:** [Helpers Reference](/extensions/helpers/) | [Core Concepts Guide](../../guides/core-concepts/application/)
