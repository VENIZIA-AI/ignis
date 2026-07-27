---
title: Schema Utility
description: Zod and OpenAPI helpers for JSON response schemas, path params, string constraints, and case conversion
difficulty: beginner
lastUpdated: 2026-07-16
---

# Schema Utility

Helper functions and predefined schemas for working with `zod` and `@hono/zod-openapi` - building JSON request/response schemas, path-param schemas, and case-converting schemas for API routes.

## In one example

```typescript
import { jsonResponse, requiredString, idParamsSchema } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const UserSchema = z.object({ id: z.number(), name: requiredString({ min: 1, max: 50 }) });

this.defineRoute({
  configs: {
    path: '/{id}',
    method: 'get',
    request: { params: idParamsSchema({ idType: 'number' }) },
    responses: jsonResponse({ schema: UserSchema, description: 'A single user object' }),
  },
  handler: (c) => {
    const { id } = c.req.valid('param');
    // ...
  },
});
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `jsonContent` | `jsonContent(opts: { schema: ZodType; description: string; required?: boolean }): { description; content; required }` | Builds a standard OpenAPI content object for an `application/json` payload. |
| `jsonResponse` | `jsonResponse(opts: { schema: ZodType; description?: string; required?: boolean; headers?: Record<string, THeaderObject> }): Record<number \| string, ...>` | Builds a full response map: `200` success (via `jsonContent`, description defaults to `'Success Response'`) plus a `'4xx \| 5xx'` error entry using `ErrorSchema`. |
| `requiredString` | `requiredString(opts?: { min?: number; max?: number; fixed?: number }): ZodString` | A non-empty (`.nonempty()`) Zod string, optionally constrained by `min`, `max`, or an exact `fixed` length. |
| `idParamsSchema` | `idParamsSchema(opts?: { idType?: 'number' \| 'string' }): ZodObject` | Builds a path-param schema for `{ id }`, typed and OpenAPI-documented as `number` (default) or `string`. Throws on any other `idType`. |
| `snakeToCamel` | `snakeToCamel<T extends ZodRawShape>(shape: T): ZodEffects` | Wraps a Zod object `shape` so it accepts `snake_case` input keys and produces a `camelCase`-keyed output, via `.transform()` piped into a camelCase-shaped schema. |

## Predefined schemas and types

| Export | What it is |
|--------|------------|
| `AnyObjectSchema` | `z.object().catchall(z.any())`, OpenAPI-described as `'Unknown schema'` - a permissive object schema. |
| `TAnyObjectSchema` | Type alias for `z.ZodObject<z.ZodRawShape>`. |
| `TInferSchema<T>` | Type alias for `z.infer<T>` - the TypeScript type inferred from a Zod schema `T`. |

## Notes

- **Two source files, one page.** `requiredString`, `AnyObjectSchema`, `TAnyObjectSchema`, and `TInferSchema` live in `schema.utility.ts`; `jsonContent`, `jsonResponse`, `idParamsSchema`, and `snakeToCamel` live in `base/models/common/types.ts`. Both are re-exported from the `@venizia/ignis` root barrel, so the import path is the same either way.
- **`jsonResponse`'s error branch is fixed** - it always uses `ErrorSchema` under the `'4xx | 5xx'` key; only the success schema, description, and headers are customizable per call.
- **HTML responses are a separate utility.** For `text/html` routes, use `htmlContent`/`htmlResponse` from the [JSX Utility](/references/utilities/jsx) instead of `jsonContent`/`jsonResponse`.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [JSX Utility](/references/utilities/jsx) - `htmlContent()` / `htmlResponse()` for HTML routes
- [Parse Utility](/references/utilities/parse) - `toCamel()` / `keysToCamel()`, the transforms `snakeToCamel` builds on
- [REST Controllers Guide](/guides/core-concepts/rest-controllers) - defining routes with `request`/`responses`

**Files:**

- [`packages/core/src/utilities/schema.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/utilities/schema.utility.ts)
- [`packages/core/src/base/models/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/models/common/types.ts)
