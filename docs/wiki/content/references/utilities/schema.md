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
| `jsonResponse` | `jsonResponse(opts: { schema: ZodType; description?: string; required?: boolean; headers?: Record<string, THeaderObject> }): Record<number \| string, ...>` | Builds a full response map: `200` success (via `jsonContent`, description defaults to `'Success Response'`) plus the `4XX` and `5XX` entries of `errorResponses()`. |
| `errorResponses` | `errorResponses(): { '4XX': ...; '5XX': ... }` | The JSON error body under `4XX` and `5XX`, both `jsonContent({ description: 'Error Response', schema: ErrorSchema })`. Spread it into a route whose success body is not JSON. |
| `requiredString` | `requiredString(opts?: { min?: number; max?: number; fixed?: number }): ZodString` | A non-empty (`.nonempty()`) Zod string, optionally constrained by `min`, `max`, or an exact `fixed` length. |
| `idParamsSchema` | `idParamsSchema(opts?: { idType: TIdSchemaType }): ZodObject` | Builds a path-param schema for `{ id }`, typed and OpenAPI-documented as `number` or `string`. `TIdSchemaType` is `'number' \| 'string'`. Throws on any other value. The whole `opts` object is optional and defaults to `number`, but once you pass it, `idType` is required. |
| `snakeToCamel` | `snakeToCamel<T extends ZodRawShape>(shape: T): ZodPipe` | Wraps a Zod object `shape` so it accepts `snake_case` input keys and produces a `camelCase`-keyed output: `z.object(shape).transform(keysToCamel).pipe(z.object(camelShape))`. |

## Predefined schemas and types

| Export | What it is |
|--------|------------|
| `AnyObjectSchema` | `z.object().catchall(z.any())`, OpenAPI-described as `'Unknown schema'` - a permissive object schema. |
| `TAnyObjectSchema` | Type alias for `z.ZodObject<z.ZodRawShape>`. |
| `TInferSchema<T>` | Type alias for `z.infer<T>` - the TypeScript type inferred from a Zod schema `T`. |

## Notes

- **Three source files, one page.** `requiredString`, `AnyObjectSchema`, `TAnyObjectSchema`, and `TInferSchema` live in `base/controllers/common/schema-builders.ts` (they call `z.object()` at module load, so they sit with the REST surface rather than in the zod-free `utilities/` barrel); `jsonContent`, `jsonResponse`, and `idParamsSchema` live in `base/models/common/schemas.ts`; `snakeToCamel` lives in `base/models/common/utilities.ts`. All three are re-exported from the `@venizia/ignis` root barrel, so the import path is the same either way.
- **`jsonResponse`'s error branch is fixed** - it always uses `ErrorSchema` under the `4XX` and `5XX` keys (the only range keys OpenAPI accepts, so client generators type the error body); only the success schema, description, and headers are customizable per call.
- **`ErrorSchema` is the named component `ErrorResponse`.** Every route's `4XX` and `5XX` reference `#/components/schemas/ErrorResponse`, so a generated client types the error as `components['schemas']['ErrorResponse']`. A schema that extends `ErrorSchema` is documented as `allOf` that reference plus its own fields. Only one schema can own the name, so rename a component of your own called `ErrorResponse`.
- **A route with a non-JSON success body** (a file stream, an image) spreads `errorResponses()` beside its own `200`:

  ```typescript
  responses: {
    [HTTP.ResultCodes.RS_2.Ok]: {
      description: 'PNG frame',
      content: { 'image/png': { schema: { type: 'string', format: 'binary' } } },
    },
    ...errorResponses(),
  },
  ```
- **The workspace is on Zod v4.** `snakeToCamel` returns a `ZodPipe`; there is no `ZodEffects` to hold, that class belonged to v3.
- **`TInferSchema<T>` constrains `T` to `z.ZodType`.** The full declaration is `TInferSchema<T extends z.ZodType> = z.infer<T>`.
- **HTML responses are a separate utility.** For `text/html` routes, use `htmlContent`/`htmlResponse` from the [JSX Utility](/references/utilities/jsx) instead of `jsonContent`/`jsonResponse`.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [JSX Utility](/references/utilities/jsx) - `htmlContent()` / `htmlResponse()` for HTML routes
- [Parse Utility](/references/utilities/parse) - `toCamel()` / `keysToCamel()`, the transforms `snakeToCamel` builds on
- [REST Controllers Guide](/guides/core-concepts/rest-controllers) - defining routes with `request`/`responses`

**Files:**

- [`packages/kernel/src/base/controllers/common/schema-builders.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/common/schema-builders.ts)
- [`packages/kernel/src/base/models/common/schemas.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/models/common/schemas.ts)
- [`packages/kernel/src/base/models/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/models/common/utilities.ts)
