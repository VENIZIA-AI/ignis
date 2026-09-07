# Route Definitions

IGNIS supports multiple methods for defining routes. Choose based on your needs.

## Method 1: Config-Driven Routes

Define route configurations as constants with UPPER_CASE names:

```typescript
// common/rest-paths.ts
export class UserRestPaths {
  static readonly ROOT = '/';
  static readonly BY_ID = '/:id';
  static readonly PROFILE = '/profile';
}

// common/route-configs.ts
// jsonResponse({ schema }) expands to a 200 response plus a '4xx | 5xx' error fallback
export const RouteConfigs = {
  GET_USERS: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.ROOT,
    responses: jsonResponse({
      description: 'List of users',
      schema: UserListSchema,
    }),
  },
  GET_USER_BY_ID: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.BY_ID,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      description: 'User detail',
      schema: UserSchema,
    }),
  },
} as const;
```

## Method 2: Using `@api` Decorator

```typescript
@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor() {
    super({ scope: UserController.name });
  }

  @api({ configs: RouteConfigs.GET_USERS })
  list(context: TRouteContext) {
    return context.json({ users: [] }, HTTP.ResultCodes.RS_2.Ok);
  }

  @api({ configs: RouteConfigs.GET_USER_BY_ID })
  getById(context: TRouteContext) {
    const { id } = context.req.valid<{ id: string }>('param');
    return context.json({ id, name: 'User' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

`@get`, `@post`, `@put`, `@patch`, and `@del` are the same decorator with `method` preset - the
config they take omits `method`.

## Method 3: Using `bindRoute` (Programmatic)

Register routes in the `binding()` lifecycle method:

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseRestController {
  constructor() {
    super({ scope: HealthCheckController.name });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: RouteConfigs.GET_HEALTH }).to({
      handler: context => context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok),
    });
  }
}
```

## Method 4: Using `defineRoute` (Inline)

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseRestController {
  constructor() {
    super({ scope: HealthCheckController.name });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: RouteConfigs.POST_PING,
      handler: context => {
        const { message } = context.req.valid<{ message: string }>('json');
        return context.json({ echo: message }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

## Comparison

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| `@api` decorator | Most routes | Clean, declarative | Requires decorator support |
| `bindRoute` | Dynamic routes | Programmatic control | More verbose |
| `defineRoute` | Simple inline routes | Quick setup | Less reusable |

## List responses

Every endpoint that returns a page of rows answers the same way, whether the CRUD factory generated it or you wrote it by hand. Call `respond` with the `range`; do not write the headers yourself, and never spell the format as a string.

```typescript
// Good
const { data, range } = await this.repository.find({ filter, options: { shouldQueryRange: true } });
return context.json(
  this.respond({ context, format: ResponseFormats.ARRAY, payload: { count: data.length, data }, range }),
  HTTP.ResultCodes.RS_2.Ok,
);

// Bad - a second copy of the contract that drifts, and a hardcoded format
context.header('Content-Range', `records ${start}-${end}/${total}`);
context.header('X-Response-Format', 'array');
return context.json({ data, count: data.length });
```

What the client gets:

| Header or body | Value |
|---|---|
| `Content-Range` | `records <start>-<end>/<total>`, or `records */<total>` for an empty page; `total` is exact |
| `X-Response-Count` | rows in this response |
| `X-Response-Format` | `array` |
| Body | `{ count, data }`, or the bare array when the request sent `x-request-count: false` |

Three rules follow from it:

- **A list never depends on a `/count` route.** The total travels in `Content-Range`. The factory's `count` verb stays available for callers that want a count alone.
- **Count with its own narrow query, next to the page query.** `shouldQueryRange: true` already does this (in parallel outside a transaction, one after the other inside one). Do not fold the count into the page query with `COUNT(*) OVER()`: it is free on a small table and costs seconds on a large one, because the window forces the whole scope to be walked before the page is cut.
- **A body that is not `{ count, data }` still sends the headers.** Call `setListHeaders({ context, range, count })`; `POST /search` does this and keeps `{ found, isFoundExact, hits }` as its body.

## OpenAPI Schema Integration

Use Zod with `.openapi()` for automatic documentation:

```typescript
const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
}).openapi({
  description: 'Create user request body',
  example: { email: 'user@example.com', name: 'John Doe' },
});

// Zod v4 top-level string formats - not the deprecated z.string().email() chain
const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  createdAt: z.iso.datetime(),
}).openapi({
  description: 'User response',
});
```

## Request Validation

```typescript
// Use an explicit status-code map (with jsonContent) when the success
// code is not 200 - jsonResponse() always keys the success response at 200
export const RouteConfigs = {
  CREATE_USER: {
    method: HTTP.Methods.POST,
    path: '/',
    request: {
      body: jsonContent({
        schema: CreateUserSchema,
        description: 'User data',
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Created]: jsonContent({
        description: 'Created user',
        schema: UserSchema,
      }),
      ['4xx | 5xx']: jsonContent({
        description: 'Error Response',
        schema: ErrorSchema,
      }),
    },
  },
} as const;
```

## See Also

- [API Usage Examples](../api-usage-examples) - Full API patterns
- [Controllers Reference](../../references/base/controllers) - Controller API
- [API Reference Component](../../extensions/components/api-reference) - OpenAPI setup
