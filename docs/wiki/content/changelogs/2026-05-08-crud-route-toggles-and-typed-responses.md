---
title: CRUD Route Toggles & Typed JSON Responses
description: Turn generated CRUD routes on or off per controller, get type-checked context.json() responses, and avoid a TS7056 declaration error.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-08

## CRUD Route Toggles & Typed JSON Responses

**In one line.** You can hide generated CRUD routes without a custom controller, and handlers that return the wrong response shape now fail to compile.

## What changed

- **Per-route `enabled` flag.** Each entry in `routes` accepts `enabled?: boolean` (default `true`).
- **`enabledRoutes` whitelist.** List the route keys to register; everything else is skipped. It takes priority over the per-route flags.
- **Typed `context.json()`.** `TContext` and `TRouteContext` are generic over the response body, and `context.json(body, status)` is checked against the route's declared response schemas. This is type-level only.
- **Fix for TS7056.** Generated CRUD controllers no longer force TypeScript to serialize the whole route-definitions tree into the `.d.ts`, which failed for entities with complex Zod schemas.

```typescript
ControllerFactory.defineCrudController({
  entity: User,
  repository: { name: 'UserRepository' },
  controller: {
    name: 'UserController',
    basePath: '/users',
    routes: {
      deleteById: { enabled: false },
      deleteBy: { enabled: false },
    },
  },
});

// or register only what you need
controller: {
  name: 'StatsController',
  basePath: '/stats',
  enabledRoutes: ['count'],
}
```

## Who is affected

- **All users.** No action needed. Every route stays enabled unless set to `false`, and `enabledRoutes` is opt-in.
- **Handlers returning a wrong shape.** Handlers that already return the declared shape compile unchanged. Others now get a compile error.
