# Schema Utility

The Schema utility provides a set of helper functions and predefined schemas for working with `zod` and `@hono/zod-openapi`. These utilities simplify the process of defining API request/response schemas and improve consistency in your API documentation.

## `jsonContent`

The `jsonContent` function creates a standard OpenAPI content object for `application/json` payloads.

```typescript
import { jsonContent, z } from '@venizia/ignis';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const userResponse = {
  description: 'A single user object',
  ...jsonContent({ schema: UserSchema }),
};
```

## `jsonResponse`

The `jsonResponse` function generates a standard OpenAPI response object that includes a success (200 OK) response and a default error response for 4xx/5xx status codes.

```typescript
import { jsonResponse, z } from '@venizia/ignis';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    responses: jsonResponse({
      description: 'A single user object',
      schema: UserSchema,
    }),
  },
  // ...
});
```

## `requiredString`

This function creates a `zod` string schema that is non-empty and can be further constrained by length.

```typescript
import { requiredString } from '@venizia/ignis';

const schema = z.object({
  username: requiredString({ min: 3, max: 20 }),
  password: requiredString({ min: 8 }),
});
```

## Predefined Schemas

-   **`AnyObjectSchema`**: A flexible schema for any object (`z.object().catchall(z.any())`).

### Type Utilities

```typescript
import { TAnyObjectSchema, TInferSchema } from '@venizia/ignis';

// TAnyObjectSchema = z.ZodObject<z.ZodRawShape>
// TInferSchema<T> = z.infer<T> — infer TypeScript type from a Zod schema

type UserType = TInferSchema<typeof UserSchema>;
```

### Custom ID Params

Use the `idParamsSchema()` helper (from controller utilities) to generate path parameter schemas:

```typescript
import { idParamsSchema } from '@venizia/ignis';

this.defineRoute({
  configs: {
    path: '/{id}',
    method: 'get',
    request: {
      params: idParamsSchema({ idType: 'number' }),
    },
    // ...
  },
  handler: (c) => {
    const { id } = c.req.valid('param');
    // ...
  },
});
```
