# Route Definitions

Ignis supports multiple methods for defining routes. Choose based on your needs.

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
export const RouteConfigs = {
  GET_USERS: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.ROOT,
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Ok]: UserListSchema,
    }),
  },
  GET_USER_BY_ID: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.BY_ID,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Ok]: UserSchema,
      [HTTP.ResultCodes.RS_4.NotFound]: ErrorSchema,
    }),
  },
} as const;
```

## Method 2: Using `@api` Decorator

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {

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

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseController {
  constructor() {
    super({ scope: HealthCheckController.name });

    this.bindRoute({ configs: RouteConfigs.GET_HEALTH }).to({
      handler: context => context.json({ status: 'ok' }),
    });
  }
}
```

## Method 4: Using `defineRoute` (Inline)

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseController {
  constructor() {
    super({ scope: HealthCheckController.name });

    this.defineRoute({
      configs: RouteConfigs.POST_PING,
      handler: context => {
        const { message } = context.req.valid('json');
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
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Created]: UserSchema,
      [HTTP.ResultCodes.RS_4.BadRequest]: ErrorSchema,
      [HTTP.ResultCodes.RS_4.Conflict]: ErrorSchema,
    }),
  },
} as const;
```

## See Also

- [API Usage Examples](../api-usage-examples) - Full API patterns
- [Controllers Reference](../../references/base/controllers) - Controller API
- [Swagger Component](../../references/components/swagger/) - OpenAPI setup
