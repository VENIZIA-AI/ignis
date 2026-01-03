# Utilities

Pure, standalone functions providing common, reusable logic for the Ignis framework. All utilities are stateless and easy to use.

## Quick Reference

| Utility | Purpose | Key Functions |
|---------|---------|---------------|
| **Crypto** | Cryptographic operations | `hash()`, `compare()`, `encrypt()`, `decrypt()` |
| **Date** | Date/time manipulation | `format()`, `parse()`, `diff()`, `add()` |
| **JSX** | HTML/JSX responses | `htmlContent()`, `htmlResponse()` |
| **Module** | Module detection | `isInstalled()`, `resolve()` |
| **Parse** | Data type conversion | `toBoolean()`, `toNumber()`, `toArray()` |
| **Performance** | Execution timing | `measure()`, `measureAsync()` |
| **Promise** | Promise helpers | `delay()`, `timeout()`, `retry()` |
| **Request** | HTTP utilities | `parseMultipart()`, `contentDisposition()` |
| **Schema** | Zod schema helpers | `jsonContent()`, `jsonResponse()` |
| **Statuses** | Status code constants | `Statuses`, `UserStatuses`, `CommonStatuses` |

## What's in This Section

### Data Processing

- [**Crypto**](./crypto.md) - Simple, stateless cryptographic functions for hashing, comparison, and encryption/decryption operations
- [**Parse**](./parse.md) - Functions for parsing and converting data types safely with proper type inference
- [**Schema**](./schema.md) - Helpers for creating and validating Zod schemas, especially for OpenAPI request/response validation
- [**Statuses**](./statuses.md) - Standardized status code constants for entity lifecycle management

### Time & Performance

- [**Date**](./date.md) - Date and time manipulation functions built on `dayjs` with timezone support
- [**Performance**](./performance.md) - Utilities for measuring code execution time and performance profiling

### Async & HTTP

- [**JSX**](./jsx.md) - HTML and JSX response utilities for server-side rendering and OpenAPI documentation
- [**Promise**](./promise.md) - Helper functions for working with Promises including retry, timeout, and delay
- [**Request**](./request.md) - HTTP request utilities for parsing multipart form data and creating secure Content-Disposition headers

### Runtime

- [**Module**](./module.md) - Utility for checking if a Node.js module is installed at runtime

## Usage Pattern

All utilities are imported from `@venizia/ignis`:

```typescript
import {
  hash,
  compare,
  formatDate,
  toBoolean,
  jsonContent,
  jsonResponse,
  htmlResponse,
  Statuses,
} from '@venizia/ignis';

// Crypto
const hashed = await hash({ value: 'password123' });
const isMatch = await compare({ value: 'password123', hashed });

// Date
const formatted = formatDate({ date: new Date(), format: 'YYYY-MM-DD' });

// Parse
const boolValue = toBoolean('true'); // true

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

> **Related:** [Helpers Reference](../helpers/) | [Core Concepts Guide](../../guides/core-concepts/application/)
