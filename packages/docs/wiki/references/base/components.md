---
title: Components Reference
description: Technical reference for BaseComponent and pluggable modules
difficulty: advanced
---

# Deep Dive: Components

Technical reference for `BaseComponent`—the foundation for creating reusable, pluggable features in Ignis. Components are powerful containers that can group together multiple providers, services, controllers, repositories, and even entire mini-applications into a single, redistributable module.

**File:** `packages/core/src/base/components/base.ts`

## Quick Reference

| Feature | Benefit |
|---------|---------|
| **Encapsulation** | Bundle feature bindings (services, controllers) into single class |
| **Lifecycle Management** | Auto-called `binding()` method during startup |
| **Default Bindings** | Self-contained with automatic DI registration |


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
│   │   └── constants.ts
│   ├── controllers/
│   │   ├── index.ts
│   │   └── auth.controller.ts
│   ├── services/
│   │   ├── index.ts
│   │   └── jwt-token.service.ts
│   └── strategies/
│       ├── index.ts
│       ├── jwt.strategy.ts
│       └── basic.strategy.ts
└── models/
    ├── index.ts
    ├── entities/
    │   └── user-token.model.ts
    └── requests/
        ├── sign-in.schema.ts
        └── sign-up.schema.ts
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
  static readonly AUTHENTICATE_OPTIONS = '@app/authenticate/options';
  static readonly JWT_OPTIONS = '@app/authenticate/jwt/options';
}
```

**Naming Convention:**
- Class name: `[Feature]BindingKeys`
- Key format: `@app/[component]/[feature]` or `@app/[component]/[sub-feature]/[name]`

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
import { Context } from 'hono';
import { AnyObject, ValueOrPromise } from '@venizia/ignis-helpers';

// Options interface for the component
export interface IAuthenticateOptions {
  alwaysAllowPaths: Array<string>;
  tokenOptions: IJWTTokenServiceOptions;
  restOptions?: {
    useAuthController?: boolean;
    controllerOpts?: TDefineAuthControllerOpts;
  };
}

// Service options interface
export interface IJWTTokenServiceOptions {
  jwtSecret: string;
  applicationSecret: string;
  getTokenExpiresFn: () => ValueOrPromise<number>;
}

// Service contract interface
export interface IAuthService<
  SIRQ = AnyObject,
  SIRS = AnyObject,
> {
  signIn(context: Context, opts: SIRQ): Promise<SIRS>;
  signUp(context: Context, opts: SIRQ): Promise<SIRS>;
}

// Auth user type
export interface IAuthUser {
  userId: string;
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
import { TConstValue } from '@venizia/ignis-helpers';

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
  static readonly METRICS = '/metrics';
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

### Constructor Options

The `super()` constructor in your component can take the following options:

| Option | Type | Description |
| :--- | :--- | :--- |
| `scope` | `string` | **Required.** A unique name for the component, typically `MyComponent.name`. Used for logging. |
| `initDefault` | `{ enable: boolean; container: Container }` | If `enable` is `true`, the `bindings` defined below will be automatically registered with the provided `container` (usually the application instance) if they are not already bound. |
| `bindings` | `Record<string, Binding>` | An object where keys are binding keys and values are `Binding` instances. These are the default services, values, or providers that your component offers. |

### Lifecycle Flow

1. **Application Instantiates Component**: When you call `this.component(MyComponent)` in your application, the DI container creates an instance of your component.
2. **Constructor Runs**: Your component's constructor calls `super()`, setting up its scope and defining its default `bindings`. If `initDefault` is enabled, these bindings are immediately registered with the application container.
3. **Application Calls `binding()`**: During the `registerComponents` phase of the application startup, the `binding()` method of your component is called. This is where you can perform additional setup that might depend on the default bindings being available.


## Component Implementation Patterns

### Basic Component

```typescript
// src/components/health-check/component.ts
import { BaseApplication, BaseComponent, inject, CoreBindings, Binding, ValueOrPromise } from '@venizia/ignis';
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
import { BaseApplication, BaseComponent, inject, CoreBindings, Binding, ValueOrPromise, getError } from '@venizia/ignis';
import { AuthenticateBindingKeys, IAuthenticateOptions, IJWTTokenServiceOptions } from './common';
import { JWTTokenService } from './services';
import { defineAuthController } from './controllers';

const DEFAULT_OPTIONS: IAuthenticateOptions = {
  alwaysAllowPaths: [],
  tokenOptions: {
    applicationSecret: process.env.APP_ENV_APPLICATION_SECRET ?? '',
    jwtSecret: process.env.APP_ENV_JWT_SECRET ?? '',
    getTokenExpiresFn: () => parseInt(process.env.APP_ENV_JWT_EXPIRES_IN ?? '86400'),
  },
};

export class AuthenticateComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({
      scope: AuthenticateComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [AuthenticateBindingKeys.AUTHENTICATE_OPTIONS]: Binding.bind<IAuthenticateOptions>({
          key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  // Split complex logic into private methods
  private defineAuth(): void {
    const options = this.application.get<IAuthenticateOptions>({
      key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
    });

    // Validate required configuration
    if (!options?.tokenOptions.jwtSecret) {
      throw getError({
        message: '[defineAuth] Missing required jwtSecret configuration',
      });
    }

    // Bind service options
    this.application
      .bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(options.tokenOptions);

    // Register service
    this.application.service(JWTTokenService);

    // Conditionally register controller
    if (options.restOptions?.useAuthController) {
      this.application.controller(
        defineAuthController(options.restOptions.controllerOpts),
      );
    }
  }

  override binding(): ValueOrPromise<void> {
    this.defineAuth();
  }
}
```

### Component with Factory Controllers

When controllers need to be dynamically configured:

```typescript
// src/components/static-asset/component.ts
override binding(): ValueOrPromise<void> {
  const componentOptions = this.application.get<TStaticAssetsComponentOptions>({
    key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
  });

  // Create multiple controllers from configuration
  for (const [key, opt] of Object.entries(componentOptions)) {
    this.application.controller(
      AssetControllerFactory.defineAssetController({
        controller: opt.controller,
        storage: opt.storage,
        helper: opt.helper,
      }),
    );

    this.application.logger.info(
      '[binding] Asset storage bound | Key: %s | Type: %s',
      key,
      opt.storage,
    );
  }
}
```


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

- **Built-in Components:**
  - [Authentication Component](/references/components/authentication) - JWT authentication
  - [Health Check Component](/references/components/health-check) - Health endpoints
  - [Swagger Component](/references/components/swagger) - API documentation
  - [Socket.IO Component](/references/components/socket-io) - WebSocket support

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Component design patterns
  - [Code Style Standards](/best-practices/code-style-standards) - Component coding standards
