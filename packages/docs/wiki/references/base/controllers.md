---
title: REST Controllers Reference
description: Technical reference for REST controller classes and API endpoints
difficulty: beginner
---

# Deep Dive: REST Controllers

Technical reference for REST controller classes - the foundation for creating HTTP/JSON API endpoints in Ignis.

> [!NOTE]
> This page covers **REST controllers** (HTTP/JSON). For gRPC controllers using ConnectRPC, see the [gRPC Controllers Reference](./grpc-controllers.md).

**Files:**
- `packages/core/src/base/controllers/rest/abstract.ts` - Abstract base class
- `packages/core/src/base/controllers/rest/base.ts` - Concrete base class
- `packages/core/src/base/controllers/common/types.ts` - Shared types and interfaces
- `packages/core/src/base/controllers/common/constants.ts` - Transport constants and headers
- `packages/core/src/base/metadata/routes/rest.ts` - Route decorators (`@api`, `@get`, `@post`, etc.)
- `packages/core/src/base/metadata/routes/controller.ts` - `@controller` decorator
- `packages/core/src/base/controllers/factory/controller.ts` - CRUD controller factory
- `packages/core/src/components/controller/rest/rest.component.ts` - RestComponent

## Quick Reference

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| **AbstractRestController** | Base class with Hono router, auth middleware, and OpenAPI integration | `binding()`, `registerRoutesFromRegistry()`, `getRouteConfigs()`, `getJSXRouteConfigs()`, `buildRouteMiddlewares()` |
| **BaseRestController** | Concrete implementation with route registration methods | `defineRoute()`, `bindRoute()`, `defineJSXRoute()`, `toHonoHandler()` |
| **RestComponent** | Configures and mounts all REST controllers onto the application router | `binding()` |
| **ControllerFactory** | Generates typed CRUD controllers from entity definitions | `defineCrudController()` |

## Controller Transport System

Ignis supports multiple controller transports. The `@controller` decorator accepts a `transport` field to distinguish between REST and gRPC controllers.

### `ControllerTransports`

```typescript
class ControllerTransports {
  static readonly REST = 'rest';
  static readonly GRPC = 'grpc';
}

type TControllerTransport = 'rest' | 'grpc';
```

### `TControllerMetadata`

The `@controller` decorator metadata is a union type:

```typescript
interface IBaseControllerMetadata {
  path: string;
  tags?: string[];
  description?: string;
}

interface IRestControllerMetadata extends IBaseControllerMetadata {
  transport?: typeof ControllerTransports.REST; // Optional — defaults to REST
}

interface IGrpcControllerMetadata<ServiceType = unknown> extends IBaseControllerMetadata {
  transport: typeof ControllerTransports.GRPC; // Required for gRPC
  service: ServiceType;
}

type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;
```

REST controllers do not need to specify `transport` explicitly — it defaults to REST when omitted.

### Application Transport Configuration

The application configures which transports to enable:

```typescript
class MyApp extends BaseApplication {
  constructor() {
    super({
      // Defaults to ['rest'] if omitted
      transports: [ControllerTransports.REST, ControllerTransports.GRPC],
    });
  }
}
```

During `registerControllers()`, the application creates a `RestComponent` for REST transport and a `GrpcComponent` for gRPC transport.

## `RestComponent`

**File:** `packages/core/src/components/controller/rest/rest.component.ts`

The `RestComponent` is responsible for discovering, configuring, and mounting all REST controllers onto the application's root Hono router. It is automatically instantiated by `BaseApplication.registerControllers()` when the REST transport is enabled.

### Behavior

1. Finds all bindings tagged with the `controllers` namespace
2. Skips any controller whose metadata has `transport: 'grpc'`
3. Validates that each remaining controller has a `path` in its metadata
4. Resolves each controller instance from the IoC container
5. Calls `configure()` on the controller (which runs `binding()` + `registerRoutesFromRegistry()`)
6. Mounts the controller's router at `metadata.path` on the application's root router
7. Dynamically re-fetches controller bindings after each mount to pick up any controllers added during configuration

```typescript
export class RestComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({
      scope: RestComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [RestBindingKeys.REST_COMPONENT_OPTIONS]: Binding.bind<IRestComponentConfig>({
          key: RestBindingKeys.REST_COMPONENT_OPTIONS,
        }).toValue({}),
      },
    });
  }
}
```

## Routing Approaches

| Approach | When to Use | Example |
|----------|-------------|---------|
| **Decorator-Based** (Recommended) | Clean, declarative routes | `@get({ configs: {...} })` |
| **Imperative (`defineRoute`)** | Complex routing logic, feature flags | `this.defineRoute({ configs, handler })` |
| **Fluent (`bindRoute`)** | Two-step route registration | `this.bindRoute({ configs }).to({ handler })` |
| **JSX (`defineJSXRoute`)** | Server-rendered HTML pages | `this.defineJSXRoute({ configs, handler })` |

## `AbstractRestController`

Base class integrating Hono routing with Ignis DI, authentication/authorization middleware, and OpenAPI generation.

**Generic Parameters:**

```typescript
abstract class AbstractRestController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>,
> extends BaseHelper implements IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions>
```

### Constructor

```typescript
constructor(opts: IControllerOptions)
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `scope` | `string` | Required | Logger scope name |
| `path` | `string` | — | Route base path. Falls back to `@controller` decorator path if not provided |
| `isStrict` | `boolean` | `true` | When `true`, `/users` and `/users/` are different routes |

Path resolution priority: `@controller` decorator metadata > constructor `path` option. Throws if neither provides a path.

### Key Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `isConfigured` | `boolean` | Guards against double configuration |
| `router` | `OpenAPIHono` | The controller's Hono router instance |
| `path` | `string` | Resolved base path |
| `definitions` | `Definitions` | Route definition configs (used by factory-generated controllers) |

### Methods

#### `configure(opts?): Promise<OpenAPIHono>`

Configures the controller. Idempotent — returns the router immediately if already configured.

1. Calls `binding()` (your manual route definitions)
2. Calls `registerRoutesFromRegistry()` (decorator-based routes)
3. Sets `isConfigured = true`

#### `registerRoutesFromRegistry(): void`

Reads route metadata registered by `@get`, `@post`, `@api`, etc. decorators and binds them to the router using `bindRoute().to()`.

#### `getRouteConfigs<RouteConfig>(opts: { configs: RouteConfig })`

Processes a route config, injecting authentication/authorization middleware and OpenAPI security specs. Returns a Hono `createRoute` result. Automatically appends the controller's `scope` as a tag.

#### `getJSXRouteConfigs<RouteConfig>(opts: { configs: RouteConfig })`

Like `getRouteConfigs` but additionally merges an HTML response schema for JSX/server-rendered routes.

#### `buildRouteMiddlewares<RouteConfig>(opts: { configs: RouteConfig })`

Internal method that extracts `authenticate`, `authorize`, and `middleware` from a route config and builds the middleware chain:

1. If `authenticate.strategies` is non-empty, adds `authenticateFn` middleware
2. If `authorize` is present (single spec or array), adds `authorizeFn` middleware(s)
3. If `middleware` is present (single or array), appends custom middleware(s)

Returns `{ restConfig, security, mws }`.

#### `binding(): ValueOrPromise<void>` (abstract)

Override to register routes manually using `bindRoute` or `defineRoute`.

## `BaseRestController`

Extends `AbstractRestController` with concrete implementations for `bindRoute`, `defineRoute`, and `defineJSXRoute`.

### `defineRoute<RouteConfig, ResponseType>(opts)`

Defines and registers a route with its handler in a single call.

```typescript
defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
  configs: RouteConfig;
  handler: TRouteHandler<ResponseType, RouteEnv>;
  hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
}): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>
```

- **`configs`**: Route configuration including path, method, request/response schemas, and optional auth
- **`handler`**: Route handler function `(context: TRouteContext) => Response`
- **`hook`**: Optional Hono hook for validation error handling

Returns `{ configs, route }`.

### `bindRoute<RouteConfig>(opts)`

Creates a fluent binding for two-step route registration.

```typescript
bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
  configs: RouteConfig;
}): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>
```

Returns `{ configs, to }` where `to({ handler })` completes the registration and returns `{ configs, route }`.

### `defineJSXRoute<RouteConfig, ResponseType>(opts)`

Defines a route that renders server-side HTML via `c.html()`. Same signature as `defineRoute` but uses `getJSXRouteConfigs` instead of `getRouteConfigs`, which automatically adds an HTML response schema.

```typescript
defineJSXRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
  configs: RouteConfig;
  handler: TRouteHandler<ResponseType, RouteEnv>;
  hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
}): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>
```

### `toHonoHandler<ResponseType>(opts: { handler })`

Casts a `TRouteHandler` to Hono's OpenAPI handler type.

## Key Types

### `IAuthRouteConfig`

Route configuration extended with optional authentication and authorization fields. Extends Hono's `RouteConfig`.

```typescript
interface IAuthRouteConfig extends HonoRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

### `IControllerOptions`

```typescript
interface IControllerOptions {
  scope: string;
  path?: string;     // Falls back to @controller decorator path
  isStrict?: boolean; // Default: true
}
```

### `TRouteContext`

Lightweight typed context that provides type-safe `req.valid()` calls:

```typescript
type TRouteContext<RouteEnv extends Env = Env> = TContext<RouteEnv, keyof IValidRequestProps>;
```

Where `IValidRequestProps` supports: `json`, `query`, `param`, `header`, `cookie`, `form`.

### `TRouteHandler`

```typescript
type TRouteHandler<ResponseType = unknown, RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv>,
) => ValueOrPromise<Response | TypedResponse<ResponseType>>;
```

### `IBindRouteOptions`

```typescript
interface IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
  configs: RouteConfig;
  to: <ResponseType = unknown>(opts: {
    handler: TRouteHandler<ResponseType, RouteEnv>;
  }) => IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

### `IDefineRouteOptions`

```typescript
interface IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
  configs: ReturnType<typeof createRoute<string, RouteConfig>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
}
```

### `IController`

Base controller interface:

```typescript
interface IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions>
  extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
  bindRoute<RouteConfig>(opts: { configs: RouteConfig }): IBindRouteOptions<...>;
  defineRoute<RouteConfig, ResponseType>(opts: { configs; handler; hook? }): IDefineRouteOptions<...>;
}
```

### `asTypedContext`

Utility to cast middleware context to `TContext`:

```typescript
const asTypedContext = <E extends Env>(context: unknown): TContext<E, string> => {
  return context as TContext<E, string>;
};
```

### Route Auth Types (for CRUD Controllers)

```typescript
// Per-route authentication config
type TRouteAuthenticateConfig =
  | { skip: true }
  | { skip?: false; strategies?: TAuthStrategy[]; mode?: TAuthMode };

// Per-route authorization config
type TRouteAuthorizeConfig = { skip: true } | IAuthorizationSpec | IAuthorizationSpec[];

// Combined per-route auth config
type TRouteAuthConfig = {
  authenticate?: TRouteAuthenticateConfig;
  authorize?: TRouteAuthorizeConfig;
};
```

### `TCustomizableRouteConfig`

Per-route customization for CRUD controller endpoints:

```typescript
type TCustomizableRouteConfig = TRouteAuthConfig & {
  request?: {
    params?: TAnyObjectSchema;
    query?: TAnyObjectSchema;
    body?: TAnyObjectSchema;
    headers?: TAnyObjectSchema;
  };
  response?: {
    schema?: z.ZodTypeAny;
    headers?: TResponseHeaders;
  };
};
```

### `ICustomizableRoutes`

```typescript
interface ICustomizableRoutes<
  RouteConfig extends TCustomizableRouteConfig = TCustomizableRouteConfig,
> {
  count?: RouteConfig;
  find?: RouteConfig;
  findById?: RouteConfig;
  findOne?: RouteConfig;
  create?: RouteConfig;
  updateById?: RouteConfig;
  updateBy?: RouteConfig;
  deleteById?: RouteConfig;
  deleteBy?: RouteConfig;
}
```

## Route Decorators

**File:** `packages/core/src/base/metadata/routes/rest.ts`

### `@controller` Decorator

Registers controller metadata (path, transport, tags, description) via the `MetadataRegistry`.

```typescript
import { controller } from '@venizia/ignis';

@controller({ path: '/users' })
export class UserController extends BaseRestController { ... }

// With additional metadata
@controller({ path: '/users', tags: ['Users'], description: 'User management' })
export class UserController extends BaseRestController { ... }
```

### `@api` Decorator

Generic route decorator. Registers route config in the metadata registry.

```typescript
import { api, BaseRestController, controller, jsonResponse, z, TRouteContext } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

const MyRouteConfig = {
  method: 'get',
  path: '/data',
  responses: jsonResponse({ schema: z.object({ success: z.boolean() }) }),
} as const;

@controller({ path: '/my-feature' })
export class MyFeatureController extends BaseRestController {

  @api({ configs: MyRouteConfig })
  getData(c: TRouteContext) {
    return c.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### HTTP Method Decorators (`@get`, `@post`, `@put`, `@patch`, `@del`)

Shorthand decorators that auto-set the HTTP method. Accept the same `configs` object as `@api` but without the `method` property.

```typescript
import { get, post, put, patch, del } from '@venizia/ignis';
```

Each decorator calls `@api` internally with the appropriate `HTTP.Methods.*` value.

**Example using `@get` and `@post`:**

```typescript
import { get, post, z, jsonContent, jsonResponse, Authentication, TRouteContext } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

const UserRoutes = {
  LIST_USERS: {
    path: '/',
    responses: jsonResponse({
      description: 'A list of users',
      schema: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  GET_USER: {
    path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      description: 'A single user',
      schema: z.object({ id: z.string(), name: z.string() }),
    }),
  },
  CREATE_USER: {
    path: '/',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    request: {
      body: jsonContent({
        schema: z.object({ name: z.string() }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({ id: z.string(), name: z.string() }),
    }),
  },
} as const;

// ... inside a controller class

  @get({ configs: UserRoutes.LIST_USERS })
  getAllUsers(c: TRouteContext) {
    return c.json([{ id: '1', name: 'John Doe' }], HTTP.ResultCodes.RS_2.Ok);
  }

  @get({ configs: UserRoutes.GET_USER })
  getUserById(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');
    return c.json({ id, name: 'John Doe' }, HTTP.ResultCodes.RS_2.Ok);
  }

  @post({ configs: UserRoutes.CREATE_USER })
  createUser(c: TRouteContext) {
    const { name } = c.req.valid<{ name: string }>('json');
    const newUser = { id: '2', name };
    return c.json(newUser, HTTP.ResultCodes.RS_2.Created);
  }
```

### Decorator-Based Routing Notes

- The `binding()` method is not required if you use only decorator-based routing
- Routes are discovered and registered during `configure()` via `registerRoutesFromRegistry()`
- TypeScript automatically infers and validates return types against the OpenAPI response schema — no need for explicit `TRouteResponse` annotations
- Use `as const` on route config objects for strict type inference

## Manual Route Definition

For advanced use cases — dynamic routes, feature flags, programmatic control — define routes inside `binding()`.

### `defineRoute` Example

```typescript
this.defineRoute({
  configs: {
    method: 'get',
    path: '/status',
    responses: jsonResponse({ schema: z.object({ ok: z.boolean() }) }),
    authenticate: { strategies: ['jwt'] },
    authorize: { resource: 'status', scopes: ['read'] },
  },
  handler: async (context) => {
    return context.json({ ok: true }, 200);
  },
  hook: (result, context) => {
    // Optional hook for post-processing
  },
});
```

### `bindRoute` Example

```typescript
const { configs } = this.bindRoute({
  configs: {
    method: 'post',
    path: '/action',
    request: {
      body: jsonContent({ schema: z.object({ name: z.string() }) }),
    },
    responses: jsonResponse({ schema: z.object({ id: z.string() }) }),
  },
}).to({
  handler: async (context) => {
    const data = context.req.valid('json');
    return context.json({ id: '123' }, 201);
  },
});
```

### `defineJSXRoute` Example

```typescript
this.defineJSXRoute({
  configs: {
    path: '/dashboard',
    method: 'get',
    responses: {}, // HTML response schema is auto-merged
  },
  handler: async (c) => {
    const data = await this.dashboardService.getData();
    return c.html(<DashboardPage data={data} />);
  },
  hook: (result, c) => {
    // Optional hook for post-processing
  },
});
```

## `IAuthRouteConfig` Options

The `configs` object extends the OpenAPI 3.0 `RouteConfig` from `@hono/zod-openapi`.

| Property | Type | Description |
| :--- | :--- | :--- |
| `path` | `string` | Route path relative to the controller's base path (e.g., `/{id}`) |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | HTTP method (auto-set by `@get`, `@post`, etc.) |
| `request` | `object` | Request definition: `params`, `query`, `body`, `headers` (Zod schemas) |
| `responses` | `object` | HTTP status code to response description/schema mapping |
| `tags` | `string[]` | OpenAPI tags. The controller's `scope` is automatically appended |
| `summary` | `string` | Short summary of the operation |
| `description` | `string` | Detailed description of the operation |
| `authenticate` | `{ strategies?: TAuthStrategy[]; mode?: TAuthMode }` | Auth strategies. If provided, framework injects auth middleware automatically |
| `authorize` | `IAuthorizationSpec \| IAuthorizationSpec[]` | Authorization spec(s). If provided, framework injects authorize middleware after authenticate |
| `middleware` | `MiddlewareHandler \| MiddlewareHandler[]` | Custom middleware(s) appended after auth middleware |

### Example of `request` Configuration

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent } from '@venizia/ignis';

// ...
request: {
  params: z.object({ id: z.string() }),
  query: z.object({ format: z.string().optional() }),
  body: jsonContent({
    schema: z.object({ name: z.string() })
  })
}
// ...
```

## Standard Headers and Constants

**File:** `packages/core/src/base/controllers/common/constants.ts`

### `RestPaths`

```typescript
class RestPaths {
  static readonly ROOT = '/';
  static readonly COUNT = '/count';
  static readonly FIND_ONE = '/find-one';
}
```

### Built-in Header Schemas

| Constant | Headers Included |
| :--- | :--- |
| `trackableHeaders` | `x-request-id`, `x-request-channel`, `x-request-device-info` (all optional) |
| `countableHeaders` | `x-request-count` — controls `{count, data}` vs data-only response format |
| `defaultRequestHeaders` | `trackableHeaders` + `countableHeaders` combined |
| `commonResponseHeaders` | `x-request-id` (echo), `x-response-count`, `x-response-format` |
| `findResponseHeaders` | `commonResponseHeaders` + `content-range` for pagination |

## `ControllerFactory`

The `ControllerFactory` provides a static method `defineCrudController` to quickly generate a pre-configured CRUD controller for any given `BaseEntity` and its corresponding repository.

**File:** `packages/core/src/base/controllers/factory/controller.ts`

### `static defineCrudController<EntitySchema>(opts: ICrudControllerOptions<EntitySchema>)`

Returns a `BaseRestController` subclass with standard CRUD endpoints pre-configured. The returned class is dynamically named using `controller.name` from the options.

| Route Name | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| `count` | `GET` | `/count` | Count records matching a where condition |
| `find` | `GET` | `/` | Find records with filter, pagination, sorting, and relations |
| `findById` | `GET` | `/{id}` | Find a single record by its ID |
| `findOne` | `GET` | `/find-one` | Find the first record matching a filter |
| `create` | `POST` | `/` | Create a new record |
| `updateById` | `PATCH` | `/{id}` | Partial update a record by its ID |
| `updateBy` | `PATCH` | `/` | Bulk update records matching a `where` filter |
| `deleteById` | `DELETE` | `/{id}` | Delete a record by its ID |
| `deleteBy` | `DELETE` | `/` | Bulk delete records matching a `where` filter |

### `ICrudControllerOptions<EntitySchema>`

| Option | Type | Description |
| :--- | :--- | :--- |
| `entity` | `TClass<BaseEntity<EntitySchema>> \| TResolver<TClass<BaseEntity<EntitySchema>>>` | Entity class or resolver function returning it. Used to derive request/response schemas |
| `repository.name` | `string` | Repository binding key name in the IoC container (e.g., `'ConfigurationRepository'`) |
| `controller.name` | `string` | Unique name for the generated controller (e.g., `'ConfigurationController'`) |
| `controller.basePath` | `string` | Base path for all routes (e.g., `'/configurations'`). Required |
| `controller.readonly` | `boolean` | If `true`, only read operations (count, find, findOne, findById) are generated. Defaults to `false` |
| `controller.isStrict` | `{ path?: boolean; requestSchema?: boolean }` | `path` (default `true`): strict path matching. `requestSchema` (default `true`): strict query parameter validation |
| `authenticate` | `{ strategies?: TAuthStrategy[]; mode?: TAuthMode }` | Authentication config applied to all routes (unless overridden per-route) |
| `authorize` | `IAuthorizationSpec \| IAuthorizationSpec[]` | Authorization config applied to all routes (unless overridden per-route) |
| `routes` | `ICustomizableRoutes` | Per-route configuration combining schema and auth overrides |

### Routes Configuration

The `routes` option provides per-route customization of request/response schemas and auth:

```typescript
type TRouteAuthConfig = {
  authenticate?: { skip: true } | { skip?: false; strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: { skip: true } | IAuthorizationSpec | IAuthorizationSpec[];
};

type TCustomizableRouteConfig = TRouteAuthConfig & {
  request?: {
    params?: TAnyObjectSchema;
    query?: TAnyObjectSchema;
    body?: TAnyObjectSchema;
    headers?: TAnyObjectSchema;
  };
  response?: {
    schema?: z.ZodTypeAny;
    headers?: TResponseHeaders;
  };
};
```

| Route | Customizable Components | Description |
| :--- | :--- | :--- |
| `count` | query, headers, response | Config for count endpoint |
| `find` | query, headers, response | Config for find endpoint |
| `findOne` | query, headers, response | Config for findOne endpoint |
| `findById` | query, headers, params, response | Config for findById endpoint |
| `create` | headers, body, response | Config for create endpoint |
| `updateById` | headers, params, body, response | Config for updateById endpoint |
| `updateBy` | query, headers, body, response | Config for updateBy endpoint |
| `deleteById` | headers, params, response | Config for deleteById endpoint |
| `deleteBy` | query, headers, response | Config for deleteBy endpoint |

### Auth Resolution Priority

When resolving authentication for a route:

1. **Endpoint `authenticate: { skip: true }`** — No auth (ignores controller `authenticate`)
2. **Endpoint `authenticate: { strategies }`** — Override controller (empty array = no auth)
3. **Controller `authenticate`** — Default fallback

When resolving authorization for a route:

1. **Endpoint `authenticate: { skip: true }`** — No authorize (auth skipped entirely)
2. **Endpoint `authorize: { skip: true }`** — No authorize (explicitly skipped)
3. **Endpoint `authorize: { ... }`** — Override controller authorize
4. **Controller `authorize`** — Default fallback

### Authentication Examples

```typescript
import { Authentication, ControllerFactory } from '@venizia/ignis';

// 1. JWT auth on ALL routes
const UserController = ControllerFactory.defineCrudController({
  entity: UserEntity,
  repository: { name: 'UserRepository' },
  controller: { name: 'UserController', basePath: '/users' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
});

// 2. JWT auth on all, but skip for public read endpoints
const ProductController = ControllerFactory.defineCrudController({
  entity: ProductEntity,
  repository: { name: 'ProductRepository' },
  controller: { name: 'ProductController', basePath: '/products' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  routes: {
    find: { authenticate: { skip: true } },
    findById: { authenticate: { skip: true } },
    count: { authenticate: { skip: true } },
  },
});

// 3. No controller auth, require JWT only for write operations
const ArticleController = ControllerFactory.defineCrudController({
  entity: ArticleEntity,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  routes: {
    create: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    updateById: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    deleteById: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
  },
});

// 4. Custom request/response schemas with auth and authorization
const OrderController = ControllerFactory.defineCrudController({
  entity: OrderEntity,
  repository: { name: 'OrderRepository' },
  controller: { name: 'OrderController', basePath: '/orders' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { resource: 'orders', scopes: ['read'] },
  routes: {
    find: {
      authenticate: { skip: true },
      response: { schema: CustomOrderListSchema },
    },
    create: {
      authorize: { resource: 'orders', scopes: ['write'] },
      request: { body: CustomOrderCreateSchema },
      response: { schema: CustomOrderResponseSchema },
    },
  },
});
```

### Route Customization Examples

```typescript
import { Authentication, ControllerFactory } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
});

const PublicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

const UserController = ControllerFactory.defineCrudController({
  entity: UserEntity,
  repository: { name: 'UserRepository' },
  controller: { name: 'UserController', basePath: '/users' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  routes: {
    find: {
      authenticate: { skip: true },
      response: { schema: z.array(PublicUserSchema) },
    },
    findById: {
      authenticate: { skip: true },
      response: { schema: PublicUserSchema },
    },
    create: {
      request: { body: CreateUserSchema },
      response: { schema: PublicUserSchema },
    },
    deleteById: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    },
  },
});
```

### Full Example

```typescript
// src/controllers/configuration.controller.ts
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  controller,
  ControllerFactory,
  inject,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';

const BASE_PATH = '/configurations';

const _ConfigurationController = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
    isStrict: { path: true, requestSchema: true },
  },
  entity: () => Configuration,
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends _ConfigurationController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository);
  }
}
```

### Overriding CRUD Methods with Strong Typing

When extending a generated CRUD controller, you can override methods using `TRouteContext` and explicit type arguments for validation.

```typescript
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  Authentication,
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
  TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

const BASE_PATH = '/configurations';

const CreateConfigurationSchema = z.object({
  code: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  group: z.string().min(1).max(50),
});

type TCreateConfiguration = z.infer<typeof CreateConfigurationSchema>;

const CreateResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  message: z.string(),
});

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: { name: 'ConfigurationController', basePath: BASE_PATH },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  entity: () => Configuration,
  routes: {
    count: { authenticate: { skip: true } },
    create: {
      request: { body: CreateConfigurationSchema },
      response: { schema: CreateResponseSchema },
    },
  },
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository);
  }

  override async create(opts: { context: TRouteContext }) {
    const { context } = opts;
    const data = context.req.valid<TCreateConfiguration>('json');

    this.logger.info('[create] code: %s, group: %s', data.code, data.group);

    // Custom business logic here...
    return super.create(opts);
  }

  override async updateById(opts: { context: TRouteContext }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: string }>('param');

    this.logger.info('[updateById] id: %s', id);

    return super.updateById(opts);
  }

  override async deleteById(opts: { context: TRouteContext }) {
    const { context } = opts;
    const { id } = context.req.valid<{ id: string }>('param');

    this.logger.warn('[deleteById] Deleting id: %s', id);

    return super.deleteById(opts);
  }
}
```

### Generated Controller Internal Methods

The factory-generated controller includes a `normalizeCountData` method that checks the `x-request-count` header to determine response format:

- When `x-request-count` is `"true"` or omitted: returns `{ count, data }`
- When `x-request-count` is `"false"`: returns data only

Bulk operations (`updateBy`, `deleteBy`) require a non-empty `where` filter and return `400 Bad Request` if omitted.

## See Also

- **Related References:**
  - [gRPC Controllers](./grpc-controllers.md) - gRPC controller reference with ConnectRPC integration
  - [Services](./services.md) - Business logic layer called by controllers
  - [Repositories](./repositories/) - Data access layer for CRUD operations
  - [Middlewares](./middlewares.md) - Request/response middleware
  - [Application](./application.md) - Application setup and controller mounting
  - [Dependency Injection](./dependency-injection.md) - DI patterns and injection

- **Guides:**
  - [Controllers Guide](/guides/core-concepts/rest-controllers)
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api)

- **Best Practices:**
  - [API Usage Examples](/best-practices/api-usage-examples)
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips)
  - [Security Guidelines](/best-practices/security-guidelines)

- **External Resources:**
  - [OpenAPI Specification](https://swagger.io/specification/)
  - [HTTP Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
