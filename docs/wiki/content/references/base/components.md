---
title: Components Reference
description: Technical reference for BaseComponent and pluggable modules
difficulty: advanced
---

# Deep Dive: Components

Technical reference for `BaseComponent`-the foundation for creating reusable, pluggable features in IGNIS. Components are powerful containers that can group together multiple providers, services, controllers, repositories, and even entire mini-applications into a single, redistributable module.

**File:** `packages/core/src/base/components/base.ts`

## Quick Reference

| Feature | Benefit |
|---------|---------|
| **Encapsulation** | Bundle feature bindings (services, controllers) into single class |
| **Lifecycle Management** | Auto-called `binding()` method during startup |
| **Default Bindings** | Self-contained with automatic DI registration |
| **Idempotent Configure** | `configure()` is safe to call multiple times - runs `binding()` only once |
| **Controller Transports** | `RestComponent` and `GrpcComponent` handle controller discovery per transport |


## Component Directory Structure

A well-organized component follows a consistent directory structure that separates concerns and makes the codebase maintainable.

### Simple Component

```
src/components/health-check/
├── index.ts              # Barrel exports (re-exports everything)
├── component.ts          # Component class with binding logic
├── controller.ts         # Controller class(es)
└── common/
    ├── index.ts          # Barrel exports for common/
    ├── keys.ts           # Binding key constants
    ├── types.ts          # Interfaces and type definitions
    ├── constants.ts      # Static class constants (optional)
    └── rest-paths.ts     # Route path constants (optional)
```

### Complex Component (with services, models, strategies)

```
src/components/auth/
├── index.ts
├── authenticate/
│   ├── index.ts
│   ├── component.ts
│   ├── common/
│   │   ├── index.ts
│   │   ├── keys.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── codecs.ts
│   ├── controllers/
│   │   ├── index.ts
│   │   ├── factory.ts
│   │   └── jwks/
│   ├── middlewares/
│   ├── providers/
│   ├── services/
│   │   ├── index.ts
│   │   ├── basic/
│   │   └── bearer/
│   │       ├── jws.service.ts
│   │       └── jwks/
│   └── strategies/
│       ├── index.ts
│       ├── jws.strategy.ts
│       ├── jwks.strategy.ts
│       ├── basic.strategy.ts
│       └── strategy-registry.ts
└── models/
    ├── index.ts
    ├── entities/
    │   ├── user.model.ts
    │   ├── role.model.ts
    │   ├── permission.model.ts
    │   └── policy-definition.model.ts
    └── requests/
        ├── sign-in.schema.ts
        ├── sign-up.schema.ts
        └── change-password.schema.ts
```

### Controller Transport Component

Transport components live under `src/components/controller/` and are instantiated directly by the application during `registerControllers()` - they are **not** registered via `this.component()`.

```
src/components/controller/
├── index.ts              # Barrel re-exports (REST only; gRPC excluded from barrel)
├── rest/
│   ├── rest.component.ts
│   └── common/
│       └── types.ts      # IRestComponentConfig, RestBindingKeys
└── grpc/
    ├── grpc.component.ts
    └── common/
        └── types.ts      # IGrpcComponentConfig, GrpcBindingKeys
```


## The `common/` Directory

The `common/` directory contains shared definitions that are used throughout the component. Every component should have this directory with at least `keys.ts` and `types.ts`.

### 1. Binding Keys (`keys.ts`)

Binding keys are string constants used to register and retrieve values from the DI container. They follow the pattern `@app/[component]/[feature]`.

```typescript
// src/components/health-check/common/keys.ts
export class HealthCheckBindingKeys {
  static readonly HEALTH_CHECK_OPTIONS = '@app/health-check/options';
}
```

**For components with multiple features:**

```typescript
// src/components/auth/authenticate/common/keys.ts
export class AuthenticateBindingKeys {
  static readonly REST_OPTIONS = '@app/authenticate/rest-options';
  static readonly JWT_OPTIONS = '@app/authenticate/jwt-options';
  static readonly JWKS_OPTIONS = '@app/authenticate/jwks-options';
  static readonly BASIC_OPTIONS = '@app/authenticate/basic-options';
}
```

**Naming Convention:**
- Class name: `[Feature]BindingKeys`
- Key format: `@app/[component]/[feature]`

### 2. Types (`types.ts`)

Define all interfaces and type aliases that the component exposes or uses internally.

```typescript
// src/components/health-check/common/types.ts
export interface IHealthCheckOptions {
  restOptions: { path: string };
}
```

**For complex components with service interfaces:**

```typescript
// src/components/auth/authenticate/common/types.ts
import { AnyObject } from '@venizia/ignis-helpers';
import { Env } from 'hono';

// Options interface for the component
export interface IAuthenticateOptions {
  restOptions?: TAuthenticationRestOptions;
  jwtOptions?: TJWTTokenServiceOptions;
  basicOptions?: TBasicTokenServiceOptions;
}

// Service options type (JWS or JWKS)
export type TJWTTokenServiceOptions =
  | { standard: typeof JOSEStandards.JWS; options: IJWSTokenServiceOptions }
  | { standard: typeof JOSEStandards.JWKS; options: TJWKSTokenServiceOptions };

// Service contract interface
export interface IAuthService<
  E extends Env = Env,
  // SignIn types
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
  // SignUp types
  SURQ extends TSignUpRequest = TSignUpRequest,
  SURS = AnyObject,
  // ChangePassword types
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest,
  CPRS = AnyObject,
  // UserInformation types
  UIRQ = AnyObject,
  UIRS = AnyObject,
  // RefreshToken types
  RTRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
  refreshToken?(context: TContext<E>): Promise<RTRS>;
}

// Auth user type
export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}
```

**Naming Conventions:**
- Interfaces: `I` prefix (e.g., `IHealthCheckOptions`, `IAuthService`)
- Type aliases: `T` prefix (e.g., `TDefineAuthControllerOpts`)

### 3. Constants (`constants.ts`)

Use static classes (not enums) for constants that need type extraction and validation.

```typescript
// src/components/auth/authenticate/common/constants.ts
export class Authentication {
  // Strategy identifiers
  static readonly STRATEGY_BASIC = 'basic';
  static readonly STRATEGY_JWT = 'jwt';

  // Token types
  static readonly TYPE_BASIC = 'Basic';
  static readonly TYPE_BEARER = 'Bearer';

  // Context keys
  static readonly CURRENT_USER = 'auth.current.user';
  static readonly SKIP_AUTHENTICATION = 'authentication.skip';
}
```

**With validation (for user-configurable values):**

```typescript
// src/components/swagger/common/constants.ts
export class DocumentUITypes {
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';

  // Set for O(1) validation
  static readonly SCHEME_SET = new Set([this.SWAGGER, this.SCALAR]);

  // Validation helper
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

// src/components/swagger/common/types.ts
import { TConstValue } from '@venizia/ignis-helpers';

// Extract union type: 'swagger' | 'scalar'
export type TDocumentUIType = TConstValue<typeof DocumentUITypes>;
```

### 4. REST Paths (`rest-paths.ts`)

Define route path constants for controllers.

```typescript
// src/components/health-check/common/rest-paths.ts
export class HealthCheckRestPaths {
  static readonly ROOT = '/';
  static readonly PING = '/ping';
}
```

### 5. Barrel Exports (`index.ts`)

Every folder should have an `index.ts` that re-exports its contents:

```typescript
// src/components/health-check/common/index.ts
export * from './keys';
export * from './rest-paths';
export * from './types';

// src/components/health-check/index.ts
export * from './common';
export * from './component';
export * from './controller';
```


## `BaseComponent` Class

Abstract class for all components - structures resource binding and lifecycle management.

### Class Signature

```typescript
abstract class BaseComponent<ConfigurableOptions extends object = {}>
  extends BaseHelper
  implements IConfigurable<ConfigurableOptions>
```

`BaseComponent` extends `BaseHelper` (scoped logging via `this.logger`) and implements `IConfigurable` (the `configure()` method).

### Constructor Options

The `super()` constructor in your component can take the following options:

| Option | Type | Description |
| :--- | :--- | :--- |
| `scope` | `string` | **Required.** A unique name for the component, typically `MyComponent.name`. Used for logging. |
| `initDefault` | `{ enable: false } \| { enable: true; container: Container }` | If `enable` is `true`, the `bindings` defined below will be automatically registered with the provided `container` (usually the application instance) when `configure()` is called - but only if they are not already bound. Defaults to `{ enable: false }`. |
| `bindings` | `Record<string \| symbol, Binding>` | An object where keys are binding keys and values are `Binding` instances. These are the default services, values, or providers that your component offers. Defaults to `{}`. |

### Properties

| Property | Type | Access | Description |
| :--- | :--- | :--- | :--- |
| `bindings` | `Record<string \| symbol, Binding>` | `protected` | Default bindings the component provides. Can be set in constructor or assigned directly in the constructor body. |
| `initDefault` | `TInitDefault` | `protected` | Controls whether default bindings are auto-registered to a container. |
| `isConfigured` | `boolean` | `protected` | Guard flag - prevents `configure()` from running more than once. |

### Methods

| Method | Signature | Description |
| :--- | :--- | :--- |
| `binding()` | `abstract binding(): ValueOrPromise<void>` | **Abstract.** Override this to register services, controllers, and other resources. Called by `configure()`. |
| `configure(opts?)` | `async configure(opts?: ConfigurableOptions): Promise<void>` | Entry point. Calls `initDefaultBindings()` (if enabled), then `binding()`. Idempotent - skips if already configured. |
| `initDefaultBindings(opts)` | `protected initDefaultBindings(opts: { container: Container }): void` | Iterates `this.bindings` and registers each into the container if not already bound. |

### Lifecycle Flow

1. **Application Instantiates Component**: When you call `this.component(MyComponent)` in your application, the DI container creates an instance of your component.
2. **Constructor Runs**: Your component's constructor calls `super()`, setting up its scope and defining its default `bindings`.
3. **Application Calls `configure()`**: During the `registerComponents` phase, the application resolves each component and calls `configure()`.
4. **`configure()` Executes**: Checks `isConfigured` guard (idempotent). If `initDefault.enable` is `true`, registers default bindings into the container. Then calls `binding()`.
5. **`binding()` Runs**: Your override registers controllers, services, reads options from the container, and performs any additional setup.


## Controller Transport Components

Controller transport components are a special category. Unlike regular components registered via `this.component()`, transport components are instantiated and configured directly by `BaseApplication.registerControllers()`. They are responsible for discovering controller bindings and mounting them onto the application router.

### Transport Configuration

The application config `transports` controls which transports are enabled. Defaults to `['rest']`.

```typescript
// In your application constructor
super({
  scope: MyApplication.name,
  config: {
    // ...
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
  },
});
```

The `ControllerTransports` constants:

```typescript
export class ControllerTransports {
  static readonly REST = 'rest';
  static readonly GRPC = 'grpc';
}
```

### How `registerControllers()` Works

During the application lifecycle, `registerControllers()` iterates the configured transports and creates the corresponding component:

```typescript
// Simplified from BaseApplication.registerControllers()
const transports = this.configs.transports ?? [ControllerTransports.REST];

for (const transport of transports) {
  switch (transport) {
    case ControllerTransports.REST: {
      const restComponent = new RestComponent(this);
      await restComponent.configure();
      break;
    }
    case ControllerTransports.GRPC: {
      const grpcComponent = new GrpcComponent(this);
      await grpcComponent.configure();
      break;
    }
  }
}
```

If gRPC controllers are discovered but the `'grpc'` transport is not in the `transports` config, the application logs an error warning for each one.

### `RestComponent`

**File:** `packages/core/src/components/controller/rest/rest.component.ts`

Discovers all controller bindings tagged with `BindingNamespaces.CONTROLLER`, skips any whose metadata has `transport === ControllerTransports.GRPC`, and configures the rest as REST controllers.

```typescript
export class RestComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({
      scope: RestComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [RestBindingKeys.REST_COMPONENT_OPTIONS]: Binding.bind<IRestComponentConfig>({
          key: RestBindingKeys.REST_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override async binding(): Promise<void> { /* ... */ }
}
```

**Binding loop:**

1. Fetches all controller bindings not yet configured (tracked via a `Set<string>`).
2. For each binding, reads controller metadata from `MetadataRegistry`.
3. Skips bindings with `transport === ControllerTransports.GRPC`.
4. Validates that `metadata.path` is present (throws if missing).
5. Resolves the controller instance from the DI container, calls `instance.configure()`, and mounts it: `router.route(metadata.path, instance.getRouter())`.
6. Re-fetches bindings after each configure to pick up dynamically added controllers.

**Config types:**

```typescript
export interface IRestComponentConfig {}

export class RestBindingKeys {
  static readonly REST_COMPONENT_OPTIONS = '@app/rest/options';
}
```

### `GrpcComponent`

**File:** `packages/core/src/components/controller/grpc/grpc.component.ts`

Discovers all controller bindings tagged with `BindingNamespaces.CONTROLLER`, skips any whose metadata does **not** have `transport === ControllerTransports.GRPC`, and configures gRPC controllers.

```typescript
export class GrpcComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({
      scope: GrpcComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [GrpcBindingKeys.GRPC_COMPONENT_OPTIONS]: Binding.bind<IGrpcComponentConfig>({
          key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override async binding(): Promise<void> { /* ... */ }
}
```

**Binding loop** (same dynamic re-fetch pattern as `RestComponent`):

1. Fetches all controller bindings not yet configured.
2. Skips bindings with `transport !== ControllerTransports.GRPC`.
3. Validates `metadata.path` is present.
4. Resolves the gRPC controller instance. Skips if the instance has no `service` definition (logs a warning).
5. Sets `instance.basePath` from the application's project configs.
6. Calls `instance.configure()` and mounts: `router.route(metadata.path, instance.getRouter())`.
7. Re-fetches bindings to pick up dynamically added controllers.

**Config types:**

```typescript
export interface IGrpcComponentConfig {
  interceptors?: unknown[];
}

export class GrpcBindingKeys {
  static readonly GRPC_COMPONENT_OPTIONS = '@app/grpc/options';
}
```

> **Note:** `GrpcComponent` is excluded from the barrel export at `src/components/controller/index.ts`. You never import it in application code - `BaseApplication.registerControllers()` instantiates it automatically when `transports` includes `'grpc'`.


## Component Implementation Patterns

### Basic Component

```typescript
// src/components/health-check/component.ts
import { BaseApplication, BaseComponent, controller, inject, CoreBindings, Binding, ValueOrPromise } from '@venizia/ignis';
import { HealthCheckBindingKeys, IHealthCheckOptions } from './common';
import { HealthCheckController } from './controller';

// 1. Define default options
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
};

export class HealthCheckComponent extends BaseComponent {
  constructor(
    // 2. Inject the application instance
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({
      scope: HealthCheckComponent.name,
      // 3. Enable automatic binding registration
      initDefault: { enable: true, container: application },
      // 4. Define default bindings
      bindings: {
        [HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS]: Binding.bind<IHealthCheckOptions>({
          key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  // 5. Configure resources in binding()
  override binding(): ValueOrPromise<void> {
    // Read options (may have been overridden by user)
    const healthOptions = this.application.get<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      isOptional: true,
    }) ?? DEFAULT_OPTIONS;

    // Register controller with dynamic path
    Reflect.decorate(
      [controller({ path: healthOptions.restOptions.path })],
      HealthCheckController,
    );
    this.application.controller(HealthCheckController);
  }
}
```

### Component with Services

```typescript
// src/components/auth/authenticate/component.ts
import { BaseApplication, BaseComponent, inject, CoreBindings, Binding, ValueOrPromise } from '@venizia/ignis';
import { getError } from '@venizia/ignis-helpers';
import {
  AuthenticateBindingKeys,
  TAuthenticationRestOptions,
  TBasicTokenServiceOptions,
  TJWTTokenServiceOptions,
} from './common';
import { BasicTokenService, JWSTokenService } from './services';
import { defineAuthController } from './controllers';

export class AuthenticateComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({
      scope: AuthenticateComponent.name,
      initDefault: { enable: true, container: application },
      // Only restOptions gets a default here — jwtOptions/basicOptions are
      // bound separately (by the app, before registration) since at least one is required.
      bindings: {
        [AuthenticateBindingKeys.REST_OPTIONS]: Binding.bind<TAuthenticationRestOptions>({
          key: AuthenticateBindingKeys.REST_OPTIONS,
        }).toValue({ useAuthController: false }),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const jwtOptions = this.application.get<TJWTTokenServiceOptions>({
      key: AuthenticateBindingKeys.JWT_OPTIONS,
      isOptional: true,
    });
    const basicOptions = this.application.get<TBasicTokenServiceOptions>({
      key: AuthenticateBindingKeys.BASIC_OPTIONS,
      isOptional: true,
    });

    if (!jwtOptions && !basicOptions) {
      throw getError({
        message: '[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided',
      });
    }

    // JWT auth supports both JWS (shared-secret) and JWKS (issuer/verifier) standards -
    // see the real component for the full switch over `jwtOptions.standard`.
    if (jwtOptions) {
      this.application
        .bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
        .toValue(jwtOptions);
      this.application.service(JWSTokenService);
    }

    if (basicOptions) {
      this.application
        .bind<TBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
        .toValue(basicOptions);
      this.application.service(BasicTokenService);
    }

    const restOptions = this.application.get<TAuthenticationRestOptions>({
      key: AuthenticateBindingKeys.REST_OPTIONS,
      isOptional: true,
    });

    if (restOptions?.useAuthController) {
      // Auth controller requires JWT for token generation
      if (!jwtOptions) {
        throw getError({
          message: '[AuthenticateComponent] Auth controller requires jwtOptions to be configured',
        });
      }

      this.application.controller(defineAuthController(restOptions.controllerOpts));
    }
  }
}
```

### Component with Factory Controllers

When controllers need to be dynamically configured:

```typescript
// src/components/static-asset/component.ts (condensed)
override binding(): ValueOrPromise<void> {
  const componentOptions = this.application.get<TStaticAssetsComponentOptions>({
    key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
  });

  // Create multiple controllers from configuration
  for (const [key, opt] of Object.entries(componentOptions)) {
    const { storage, controller, helper, extra } = opt;

    this.application.controller(
      AssetControllerFactory.defineAssetController({
        controller,
        storage,
        helper,
        useMetaLink: opt.useMetaLink,
        metaLink: opt.useMetaLink ? opt.metaLink : undefined,
        options: { ...extra /* , normalizeLinkFn fallback */ },
      }),
    );

    this.application.logger.info(
      `[binding] Asset storage is bound | Key: %s | Storage type: %s | UseMetaLink: %s`,
      key,
      storage,
      Boolean(opt.useMetaLink),
    );
  }
}
```

### Component without `initDefault` (Manual Binding Assignment)

Some components skip `initDefault` and assign `this.bindings` directly in the constructor body:

```typescript
// src/components/swagger/component.ts
export class SwaggerComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: SwaggerComponent.name });

    this.bindings = {
      [SwaggerBindingKeys.SWAGGER_OPTIONS]: Binding.bind<ISwaggerOptions>({
        key: SwaggerBindingKeys.SWAGGER_OPTIONS,
      }).toValue(DEFAULT_SWAGGER_OPTIONS),
    };
  }

  override async binding() {
    // Read options, configure OpenAPI doc endpoint, UI endpoint, etc.
  }
}
```

In this pattern, `initDefault` defaults to `{ enable: false }`, so the bindings are defined but not auto-registered. The component manages its own option reading and setup in `binding()`.


## Built-in Components

### Registered via `this.component()` (Standard Components)

| Component | Key Features |
|-----------|-------------|
| **HealthCheckComponent** | `GET /health` (default path, configurable). Registers `HealthCheckController` with `GET /` and `POST /ping` endpoints. |
| **SwaggerComponent** | OpenAPI doc at `/doc/openapi.json`, UI at `/doc/explorer` (Scalar by default, Swagger UI also supported). Auto-populates app info and server URL. Registers JWT and Basic security schemes. |
| **AuthenticateComponent** | JWT and/or Basic auth strategies. Optional auth controller (`signIn`/`signUp`). Token services (`JWSTokenService`, `BasicTokenService`). |
| **AuthorizeComponent** | Casbin-based RBAC, permission mapping, `authorize()` middleware. |
| **RequestTrackerComponent** | Registers Hono `requestId()` middleware and a `RequestSpyMiddleware` for `x-request-id` header tracking and request body parsing. |

### Excluded from Barrel (Import Directly)

| Component | Import Path | Key Features |
|-----------|-------------|-------------|
| **StaticAssetComponent** | `@venizia/ignis/static-asset` | File upload/download CRUD, MinIO/Disk storage. |
| **MailComponent** | `@venizia/ignis/mail` | Nodemailer/Mailgun transporters, Direct/BullMQ/InternalQueue executors. |
| **SocketIOComponent** | `@venizia/ignis/socket-io` | Socket.IO server with Redis adapter for horizontal scaling. |
| **WebSocketComponent** | `@venizia/ignis/websocket` | WebSocket support. |

### Controller Transport Components (Not Registered via `this.component()`)

| Component | When Used |
|-----------|-----------|
| **RestComponent** | Instantiated by `registerControllers()` when `transports` includes `'rest'` (the default). Discovers and mounts REST controllers. |
| **GrpcComponent** | Instantiated by `registerControllers()` when `transports` includes `'grpc'`. Discovers and mounts gRPC controllers (ConnectRPC over HTTP). |


## Exposing and Consuming Component Options

### Pattern 1: Override Before Registration

The most common pattern - override options before registering the component:

```typescript
// src/application.ts
import { HealthCheckComponent, HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // 1. Override options BEFORE registering component
    this.bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
      .toValue({
        restOptions: { path: '/api/health' }, // Custom path
      });

    // 2. Register component (will use overridden options)
    this.component(HealthCheckComponent);
  }
}
```

### Pattern 2: Merge with Defaults

For partial overrides, merge with defaults in the component:

```typescript
// In your component's binding() method
override binding(): ValueOrPromise<void> {
  const extraOptions = this.application.get<Partial<IMyOptions>>({
    key: MyBindingKeys.OPTIONS,
    isOptional: true,
  }) ?? {};

  // Merge with defaults
  const options = { ...DEFAULT_OPTIONS, ...extraOptions };

  // Use merged options...
}
```

### Pattern 3: Deep Merge for Nested Options

For complex nested configurations:

```typescript
override binding(): ValueOrPromise<void> {
  const extraOptions = this.application.get<Partial<ISwaggerOptions>>({
    key: SwaggerBindingKeys.SWAGGER_OPTIONS,
    isOptional: true,
  }) ?? {};

  // Deep merge nested objects
  const options: ISwaggerOptions = {
    ...DEFAULT_OPTIONS,
    ...extraOptions,
    restOptions: {
      ...DEFAULT_OPTIONS.restOptions,
      ...extraOptions.restOptions,
    },
    explorer: {
      ...DEFAULT_OPTIONS.explorer,
      ...extraOptions.explorer,
    },
  };
}
```


## Best Practices Summary

| Aspect | Recommendation |
|--------|----------------|
| **Directory** | Use `common/` for shared keys, types, constants |
| **Keys** | Use `@app/[component]/[feature]` format |
| **Types** | `I` prefix for interfaces, `T` prefix for type aliases |
| **Constants** | Use static classes with `SCHEME_SET` for validation |
| **Defaults** | Define `DEFAULT_OPTIONS` constant at file top |
| **Exports** | Use barrel exports (`index.ts`) at every level |
| **Validation** | Validate required options in `binding()` |
| **Logging** | Log binding activity with structured messages |
| **Scope** | Always set `scope: ComponentName.name` |
| **Idempotency** | `configure()` is already idempotent via `isConfigured` guard - no need to add your own |


## Quick Reference Template

```typescript
// common/keys.ts
export class MyComponentBindingKeys {
  static readonly OPTIONS = '@app/my-component/options';
}

// common/types.ts
export interface IMyComponentOptions {
  restOptions: { path: string };
  // ... other options
}

// common/constants.ts (optional)
export class MyConstants {
  static readonly VALUE_A = 'a';
  static readonly VALUE_B = 'b';
}

// common/rest-paths.ts (optional)
export class MyRestPaths {
  static readonly ROOT = '/';
  static readonly BY_ID = '/:id';
}

// common/index.ts
export * from './keys';
export * from './types';
export * from './constants';
export * from './rest-paths';

// component.ts
import { BaseApplication, BaseComponent, inject, CoreBindings, Binding, ValueOrPromise } from '@venizia/ignis';
import { MyComponentBindingKeys, IMyComponentOptions } from './common';
import { MyController } from './controller';

const DEFAULT_OPTIONS: IMyComponentOptions = {
  restOptions: { path: '/my-feature' },
};

export class MyComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({
      scope: MyComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [MyComponentBindingKeys.OPTIONS]: Binding.bind<IMyComponentOptions>({
          key: MyComponentBindingKeys.OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const options = this.application.get<IMyComponentOptions>({
      key: MyComponentBindingKeys.OPTIONS,
      isOptional: true,
    }) ?? DEFAULT_OPTIONS;

    // Register controllers, services, etc.
    this.application.controller(MyController);
  }
}

// index.ts
export * from './common';
export * from './component';
export * from './controller';
```

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) - What components are
  - [Creating Components](/guides/core-concepts/components-guide) - Build your own components
  - [Application](/guides/core-concepts/application/) - Registering components
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - Component bindings
  - [gRPC Controllers](/references/base/grpc-controllers) - gRPC controller reference

- **Built-in Components:**
  - [Authentication Component](/extensions/components/authentication/) - JWT authentication
  - [Health Check Component](/extensions/components/health-check) - Health endpoints
  - [Swagger Component](/extensions/components/swagger) - API documentation
  - [Socket.IO Component](/extensions/components/socket-io/) - WebSocket support

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Component design patterns
  - [Code Style Standards](/best-practices/code-style-standards/) - Component coding standards
