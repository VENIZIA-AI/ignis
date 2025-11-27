# Schema Utility

The Schema utility provides a set of helper functions and predefined schemas for working with `zod` and `@hono/zod-openapi`. These utilities simplify the process of defining API request/response schemas and improve consistency in your API documentation.

## `jsonContent`

The `jsonContent` function creates a standard OpenAPI content object for `application/json` payloads.

```typescript
import { jsonContent, z } from '@vez/ignis';

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
import { jsonResponse, z, HTTP } from '@vez/ignis';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'A single user object',
        schema: UserSchema,
      }),
      // Other responses can be added here
    },
  },
  // ...
});
```

## `requiredString`

This function creates a `zod` string schema that is non-empty and can be further constrained by length.

```typescript
import { requiredString } from '@vez/ignis';

const schema = z.object({
  username: requiredString({ min: 3, max: 20 }),
  password: requiredString({ min: 8 }),
});
```

## Predefined Schemas

The utility also provides several predefined schemas for common use cases.

-   **`AnyObjectSchema`**: A flexible schema for any object (`z.object().catchall(z.any())`).
-   **`IdParamsSchema`**: A schema for a numeric path parameter named `id`.
-   **`UUIDParamsSchema`**: A schema for a UUID path parameter named `id`.

### Example

```typescript
import { IdParamsSchema } from '@vez/ignis';

this.defineRoute({
  configs: {
    path: '/{id}',
    method: 'get',
    request: {
      params: IdParamsSchema,
    },
    // ...
  },
  handler: (c) => {
    const { id } = c.req.valid('param'); // id is a number
    // ...
  },
});
```
