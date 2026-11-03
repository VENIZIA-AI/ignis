---
title: Controller Route Customization
description: CRUD controller routes can now customize the request (query, headers, params, body) and the response through request and response options.
packages: ['@venizia/ignis']
---

# Changelog - 2026-01-07

## Controller Factory Route Customization

**In one line.** Each CRUD route takes a `request` and a `response` option, so you can customize query parameters, headers and path parameters too, not just the body.

## What changed

- **`request` and `response` options.** `request` accepts `query`, `headers`, `params` and `body` (where the route has them); `response` accepts `schema`.
- **Typed definitions.** `AbstractController` and `BaseController` have a new `Definitions` generic parameter, so overridden methods keep the route definition types.
- **Shorter OpenAPI text.** Route descriptions are concise, and each route now has a response description.

```typescript
routes: {
  create: {
    authStrategies: [Authentication.STRATEGY_JWT],
    request: {
      body: CreateUserSchema,
      headers: CustomHeadersSchema,
    },
    response: {
      schema: PublicUserSchema,
    },
  },
  find: {
    skipAuth: true,
    request: {
      query: CustomQuerySchema,
    },
    response: {
      schema: z.array(PublicUserSchema),
    },
  },
}
```

| Route | query | headers | params | body |
|-------|-------|---------|--------|------|
| COUNT, FIND, FIND_ONE | yes | yes | - | - |
| FIND_BY_ID | yes | yes | yes | - |
| CREATE | - | yes | - | yes |
| UPDATE_BY_ID | - | yes | yes | yes |
| UPDATE_BY | yes | yes | - | yes |
| DELETE_BY_ID | - | yes | yes | - |
| DELETE_BY | yes | yes | - | - |

All routes accept `response`.

## Who is affected

- **Code using `requestBody` and `schema` on a route.** Move to the new syntax (below).

## Details

**Before:**
```typescript
routes: {
  create: {
    requestBody: CreateSchema,
    schema: ResponseSchema,
  }
}
```

**After:**
```typescript
routes: {
  create: {
    request: { body: CreateSchema },
    response: { schema: ResponseSchema },
  }
}
```

When you override a controller method, use `TRouteContext` and type the body with `context.req.valid<T>('json')`:

```typescript
import { TRouteContext } from '@venizia/ignis';

type CreateBody = z.infer<typeof CreateSchema>;

override async create(opts: { context: TRouteContext }) {
  const data = opts.context.req.valid<CreateBody>('json');
  // ... custom logic
  return super.create(opts);
}
```
