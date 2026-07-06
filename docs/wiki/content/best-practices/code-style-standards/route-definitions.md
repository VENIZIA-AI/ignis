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

## OpenAPI Schema Integration

Use Zod with `.openapi()` for automatic documentation:

```typescript
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
}).openapi({
  description: 'Create user request body',
  example: { email: 'user@example.com', name: 'John Doe' },
});

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
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
- [Swagger Component](../../extensions/components/swagger) - OpenAPI setup
