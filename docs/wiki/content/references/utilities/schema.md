# Schema Utility

The Schema utility provides a set of helper functions and predefined schemas for working with `zod` and `@hono/zod-openapi`. These utilities simplify the process of defining API request/response schemas and improve consistency in your API documentation.

## `jsonContent`

The `jsonContent` function creates a standard OpenAPI content object for `application/json` payloads.

### `jsonContent(opts)`

-   `opts` (object):
    -   `schema` (ZodType): The Zod schema describing the JSON payload.
    -   `description` (string): A description of the content.
    -   `required` (boolean, optional): Whether the content is required.

```typescript
import { jsonContent, z } from '@venizia/ignis';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const userResponse = {
  description: 'A single user object',
  ...jsonContent({ schema: UserSchema, description: 'User data' }),
};
```

## `jsonResponse`

The `jsonResponse` function generates a standard OpenAPI response object that includes a success (200 OK) response and a default error response for `4xx | 5xx` status codes. The error response uses the `ErrorSchema`.

### `jsonResponse(opts)`

-   `opts` (object):
    -   `schema` (ZodType): The Zod schema for the success response body.
    -   `description` (string, optional): A description for the success response. Defaults to `'Success Response'`.
    -   `required` (boolean, optional): Whether the content is required.
    -   `headers` (Record&lt;string, THeaderObject&gt;, optional): Custom response headers to include in the success response.

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

// With custom headers
this.defineRoute({
  configs: {
    path: '/list',
    method: 'get',
    responses: jsonResponse({
      schema: z.array(UserSchema),
      description: 'User list',
      headers: {
        'x-total-count': {
          description: 'Total number of records',
          schema: { type: 'string', examples: ['100'] },
        },
      },
    }),
  },
  // ...
});
```

## `requiredString`

This function creates a `zod` string schema that is non-empty (`nonempty()`) and can be further constrained by length.

### `requiredString(opts?)`

-   `opts` (object, optional):
    -   `min` (number, optional): Minimum string length.
    -   `max` (number, optional): Maximum string length.
    -   `fixed` (number, optional): Exact string length (uses `.length()`).

```typescript
import { requiredString } from '@venizia/ignis';

const schema = z.object({
  username: requiredString({ min: 3, max: 20 }),
  password: requiredString({ min: 8 }),
  countryCode: requiredString({ fixed: 2 }),
});
```

## Predefined Schemas

-   **`AnyObjectSchema`**: A flexible schema for any object (`z.object().catchall(z.any())`), with an OpenAPI description of `'Unknown schema'`.

### Type Utilities

```typescript
import { TAnyObjectSchema, TInferSchema } from '@venizia/ignis';

// TAnyObjectSchema = z.ZodObject<z.ZodRawShape>
// TInferSchema<T> = z.infer<T> - infer TypeScript type from a Zod schema

type UserType = TInferSchema<typeof UserSchema>;
```

## `snakeToCamel`

Transforms a Zod object shape from snake_case keys to camelCase. Uses `.transform()` and `.pipe()` to create a schema that accepts snake_case input but produces camelCase output.

```typescript
import { snakeToCamel } from '@venizia/ignis';

const schema = snakeToCamel({
  first_name: z.string(),
  last_name: z.string(),
});

// Input: { first_name: 'John', last_name: 'Doe' }
// Output: { firstName: 'John', lastName: 'Doe' }
```

## Custom ID Params

Use the `idParamsSchema()` helper to generate path parameter schemas for resource IDs:

### `idParamsSchema(opts?)`

-   `opts` (object, optional):
    -   `idType` (string): `'number'` (default) or `'string'`.

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
