---
title: CRUD Route Toggles & Typed JSON Responses
description: Enable/disable generated CRUD routes per controller, typed context.json() against route response schemas, and a d.ts size fix for the base controller
---

# Changelog - 2026-05-08

## CRUD Route Toggles & Typed JSON Responses

The CRUD controller factory gains fine-grained control over which generated routes are registered, and route handlers now get a `context.json()` typed against the route's declared response schemas. A separate fix keeps generated controller `.d.ts` output from blowing past TypeScript's serialization cap.

## Overview

- **Per-route `enabled` flag**: each entry in `routes` accepts `enabled?: boolean` (defaults `true`)
- **`enabledRoutes` whitelist**: list the route keys to register; everything else is skipped (takes priority over per-route flags)
- **Typed responses**: `TContext`/`TRouteContext` are now generic over the response body, and `context.json(body, status)` is type-checked against the route's response schema
- **`.d.ts` size fix**: the base CRUD controller no longer materializes the entire route-definitions tree into its declaration output (avoids TS7056)

## New Features

### Enable / disable generated routes

**File:** `packages/core-server/src/base/controllers/factory/controller.ts`, `packages/core-server/src/base/controllers/common/types.ts`

**Problem:** `defineCrudController` always registered the full CRUD surface (`count`, `find`, `findOne`, `create`, `updateById`, `updateBy`, `deleteById`, `deleteBy`). Hiding a route meant writing a custom controller.

**Solution:** Two complementary controls. A per-route `enabled` flag, and a controller-level `enabledRoutes` whitelist that takes priority.

```typescript
export type TCustomizableRouteConfig = TRouteAuthConfig & {
  /** Whether this route is registered. Defaults to true. */
  enabled?: boolean;
  // ...
};
```

Resolution logic:
```typescript
const isEnabled = (routeKey: keyof ICustomizableRoutes) => {
  if (controller.enabledRoutes) {
    return controller.enabledRoutes.includes(routeKey);
  }
  return routes?.[routeKey]?.enabled !== false;
};
```

**Disable specific routes:**
```typescript
ControllerFactory.defineCrudController({
  entity: User,
  repository: { name: 'UserRepository' },
  controller: {
    name: 'UserController',
    basePath: '/users',
    routes: {
      deleteById: { enabled: false }, // read/write, but no DELETE /:id
      deleteBy: { enabled: false },
    },
  },
});
```

**Whitelist only what you need:**
```typescript
controller: {
  name: 'StatsController',
  basePath: '/stats',
  // only GET /count is registered; everything else is skipped
  enabledRoutes: ['count'],
}
```

### Typed `context.json()`

**File:** `packages/core-server/src/base/controllers/common/types.ts`

**Problem:** `context.json(body)` accepted any body - a handler could return a shape that didn't match its declared OpenAPI response schema, with no compile-time check.

**Solution:** `TContext` takes a `ResponseBody` type parameter and overrides `json()` to constrain the body; `TRouteHandler` threads its `ResponseType` into the context. New helper types `TJsonResponse` and `TResponseBodyOf` derive the body type from a route's response schemas (distributive over the success/error union).

```typescript
export type TContext<
  RouteEnv extends Env = Env,
  ValidTargetKey extends string = string,
  ResponseBody = unknown,
> = Omit<Context<RouteEnv>, 'req' | 'json'> & {
  req: Omit<Context<RouteEnv>['req'], 'valid'> & { valid<T = unknown>(target: ValidTargetKey): T };
  json<StatusCode extends ContentfulStatusCode = 200>(
    body: ResponseBody,
    status?: StatusCode,
  ): TJsonResponse<ResponseBody, StatusCode>;
};

// Body type derived from a route's declared responses (success + error schemas)
export type TResponseBodyOf<R extends { responses: AnyType }> = /* distributive z.infer */;
```

**Benefits:**
- Handlers that return the wrong response shape now fail to compile
- Response types stay in sync with the OpenAPI response schemas
- No runtime cost - purely type-level

## Bug Fixes

### Base controller `.d.ts` serialization (TS7056)

**File:** `packages/core-server/src/base/controllers/factory/controller.ts`

The generated controller class previously passed `typeof routeDefinitions` as a 5th generic to `BaseRestController`. For entities with complex Zod schemas this forced TypeScript to serialize the entire route-definitions tree into the emitted `.d.ts`, exceeding the serializer limit (TS7056 - "The inferred type of this node exceeds the maximum length the compiler will serialize").

The 5th generic is now omitted (defaults to the small `Record<string, IAuthRouteConfig>`); the runtime `this.definitions = routeDefinitions` assignment is unchanged.

**Before:**
```typescript
class extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions, typeof routeDefinitions> { /* ... */ }
```

**After:**
```typescript
// 5th generic intentionally omitted to keep .d.ts small (avoids TS7056)
class extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> { /* ... */ }
```

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `src/base/controllers/common/types.ts` | `enabled` on `TCustomizableRouteConfig`; `ResponseBody` generic on `TContext`/`TRouteContext`/`TRouteHandler`; `TJsonResponse`, `TResponseBodyOf` |
| `src/base/controllers/factory/controller.ts` | `enabledRoutes` option + `isEnabled()` gating around each route; omit `Definitions` generic |
| `src/base/controllers/factory/definition.ts` | Response/header definition wiring for typed responses |

## No Breaking Changes

Defaults preserve current behavior: every route is `enabled` unless set to `false`, and `enabledRoutes` is opt-in. The typed `context.json()` is a tightening of types - handlers that already return the correct shape compile unchanged.
