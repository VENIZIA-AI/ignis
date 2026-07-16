# Utilities

Pure, standalone functions providing common, reusable logic for the IGNIS framework. All utilities are stateless and easy to use.

## Quick Reference

| Utility | Package | Purpose | Key Functions |
|---------|---------|---------|---------------|
| **Crypto** | `ignis-helpers` | Cryptographic hashing | `hash()` |
| **Date** | `ignis-helpers` | Date/time manipulation | `dayjs`, `sleep()`, `isWeekday()`, `getDateTz()`, `hrTime()` |
| **JSX** | `ignis` | HTML/JSX responses | `htmlContent()`, `htmlResponse()` |
| **Module** | `ignis-helpers` | Module validation | `validateModule()` |
| **Parse** | `ignis-helpers` | Data type conversion | `int()`, `float()`, `toBoolean()`, `toCamel()` |
| **Performance** | `ignis-helpers` | Execution timing | `executeWithPerformanceMeasure()`, `getPerformanceCheckpoint()` |
| **Promise** | `ignis-helpers` | Promise helpers | `executePromiseWithLimit()`, `isPromiseLike()`, `getDeepProperty()` |
| **Request** | `ignis-helpers` | HTTP utilities | `parseMultipartBody()`, `sanitizeFilename()`, `createContentDispositionHeader()` |
| **Schema** | `ignis` | Zod schema helpers | `jsonContent()`, `jsonResponse()`, `requiredString()`, `idParamsSchema()` |
| **Statuses** | `ignis` | Status code constants | `Statuses`, `CommonStatuses`, `UserStatuses`, `RoleStatuses` |

## What's in This Section

### Data Processing

- [**Crypto**](./crypto.md) - Simple, stateless cryptographic functions for hashing (SHA256 HMAC, MD5)
- [**Parse**](./parse.md) - Functions for parsing and converting data types safely (integers, floats, booleans, camelCase, array-to-map)
- [**Schema**](./schema.md) - Helpers for creating Zod schemas for OpenAPI request/response validation
- [**Statuses**](./statuses.md) - Standardized status code constants for entity lifecycle management

### Time & Performance

- [**Date**](./date.md) - Date and time manipulation functions built on `dayjs` with timezone support
- [**Performance**](./performance.md) - Utilities for measuring code execution time and performance profiling

### Async & HTTP

- [**JSX**](./jsx.md) - HTML and JSX response utilities for server-side rendering and OpenAPI documentation
- [**Promise**](./promise.md) - Helper functions for working with Promises including concurrency limiting and value transformation
- [**Request**](./request.md) - HTTP request utilities for parsing multipart form data and creating secure Content-Disposition headers

### Runtime

- [**Module**](./module.md) - Utility for validating that required Node.js modules are installed at runtime

## Usage Pattern

Utilities are imported from `@venizia/ignis` (schema, JSX, and status helpers) or `@venizia/ignis-helpers` (runtime utilities):

```typescript
import { jsonContent, jsonResponse, htmlResponse, requiredString, Statuses } from '@venizia/ignis';
import { hash, dayjs, sleep, int, float, toBoolean } from '@venizia/ignis-helpers';

// Crypto
const md5Hash = hash('some text', { algorithm: 'MD5', outputType: 'hex' });

// Date
const now = dayjs();
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

> **Related:** [Helpers Reference](/extensions/helpers/) | [Core Concepts Guide](../../guides/core-concepts/application/)
