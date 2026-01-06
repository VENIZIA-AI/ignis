---
title: Controller Route Customization
description: Enhanced request/response customization for CRUD controllers with typed method overrides
---

# Changelog - 2026-01-07

## Controller Factory Route Customization

This release enhances the Controller Factory with comprehensive request/response schema customization and introduces helper types for strongly-typed method overrides.

## Overview

- **Route Customization**: New `request` and `response` configuration for all CRUD routes
- **Helper Types**: Added `THandlerContext` and `TInferSchema` for typed method overrides
- **Generic Definitions**: Controllers now preserve route definition types for better IDE support
- **Compact Descriptions**: OpenAPI route descriptions made more concise
- **Response Metadata**: Added meaningful response descriptions for API explorers

## New Features

### Enhanced Route Customization

**Files:**
- `packages/core/src/base/controllers/factory/definition.ts`
- `packages/core/src/base/controllers/common/types.ts`

**Problem:** Users could only customize `requestBody` and `schema` (response). No way to customize query parameters, headers, or path parameters.

**Solution:** New unified `request` and `response` configuration objects:

```typescript
routes: {
  create: {
    authStrategies: ['jwt'],
    request: {
      body: CreateUserSchema,      // Custom request body
      headers: CustomHeadersSchema, // Custom headers
    },
    response: {
      schema: PublicUserSchema,    // Custom response body
    },
  },
  find: {
    skipAuth: true,
    request: {
      query: CustomQuerySchema,    // Custom query parameters
    },
    response: {
      schema: z.array(PublicUserSchema),
    },
  },
}
```

**Customizable Components per Route:**

| Route | query | headers | params | body | response |
|-------|-------|---------|--------|------|----------|
| COUNT | ✅ | ✅ | - | - | ✅ |
| FIND | ✅ | ✅ | - | - | ✅ |
| FIND_BY_ID | ✅ | ✅ | ✅ | - | ✅ |
| FIND_ONE | ✅ | ✅ | - | - | ✅ |
| CREATE | - | ✅ | - | ✅ | ✅ |
| UPDATE_BY_ID | - | ✅ | ✅ | ✅ | ✅ |
| UPDATE_BY | ✅ | ✅ | - | ✅ | ✅ |
| DELETE_BY_ID | - | ✅ | ✅ | - | ✅ |
| DELETE_BY | ✅ | ✅ | - | - | ✅ |

### Helper Types for Method Overrides

**File:** `packages/core/src/base/controllers/common/types.ts`

**Problem:** When overriding CRUD methods, the context type was not strongly typed.

**Solution:** New helper types for extracting context types from route definitions:

```typescript
// Extract definitions type from controller
type TRouteDefinitions = InstanceType<typeof _Controller>['definitions'];

// Use THandlerContext for typed method overrides
override async create(opts: { context: THandlerContext<TRouteDefinitions, 'CREATE'> }) {
  const { context } = opts;

  // Use TInferSchema for typed request body
  const data = context.req.valid('json') as TInferSchema<typeof CreateSchema>;

  // data.code, data.name are now strongly typed!
  return super.create(opts);
}
```

**Available Route Keys:**
- `'COUNT'`, `'FIND'`, `'FIND_BY_ID'`, `'FIND_ONE'`
- `'CREATE'`, `'UPDATE_BY_ID'`, `'UPDATE_BY'`
- `'DELETE_BY_ID'`, `'DELETE_BY'`

### Generic Controller Definitions

**Files:**
- `packages/core/src/base/controllers/abstract.ts`
- `packages/core/src/base/controllers/base.ts`
- `packages/core/src/base/controllers/factory/controller.ts`

**Problem:** Route definition types were lost, preventing proper type inference in overridden methods.

**Solution:** Added `Definitions` generic parameter to `AbstractController` and `BaseController`:

```typescript
export abstract class AbstractController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, TAuthRouteConfig<RouteConfig>> = Record<...>,
>
```

The `definitions` property now preserves the actual route definition types.

### Compact OpenAPI Descriptions

**File:** `packages/core/src/base/controllers/factory/definition.ts`

**Before:**
```typescript
description: 'Returns the total count of records matching the optional where condition. Useful for pagination metadata or checking data existence without fetching records.'
```

**After:**
```typescript
description: 'Count records matching where condition'
```

All route descriptions are now concise and easy to read in API explorers.

### Response Metadata

**File:** `packages/core/src/base/controllers/factory/definition.ts`

Added meaningful response descriptions for OpenAPI:

| Route | Response Description |
|-------|---------------------|
| COUNT | Total count of matching records |
| FIND | Array of matching records (with optional count) |
| FIND_BY_ID | Single record matching ID or null |
| FIND_ONE | First matching record or null |
| CREATE | Created record with generated fields (id, createdAt, etc.) |
| UPDATE_BY_ID | Updated record with all current fields |
| UPDATE_BY | Array of updated records |
| DELETE_BY_ID | Deleted record data |
| DELETE_BY | Array of deleted records |

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/controllers/abstract.ts` | Added `Definitions` generic parameter |
| `src/base/controllers/base.ts` | Added `Definitions` generic parameter |
| `src/base/controllers/common/types.ts` | Added `THandlerContext`, `TInferSchema`, route config types |
| `src/base/controllers/factory/controller.ts` | Made `ICrudControllerOptions` generic, added type casts |
| `src/base/controllers/factory/definition.ts` | Updated route configs, compact descriptions, response metadata |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/controllers/configuration.controller.ts` | Updated to use new route customization syntax |

## Migration Guide

### Step 1: Update Route Configuration Syntax

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

### Step 2: Use Helper Types for Method Overrides

```typescript
// Extract definitions type
type TRouteDefinitions = InstanceType<typeof _Controller>['definitions'];

// Use THandlerContext in method signature
override async create(opts: { context: THandlerContext<TRouteDefinitions, 'CREATE'> }) {
  const data = context.req.valid('json') as TInferSchema<typeof CreateSchema>;
  // ...
}
```
