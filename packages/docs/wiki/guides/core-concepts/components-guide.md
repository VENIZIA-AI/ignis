# Creating Components Guide

This guide walks you through creating your own components step-by-step.

## What Problem Do Components Solve?

Imagine you're building multiple applications that all need the same features: authentication, health checks, file uploads. Without components, you'd copy-paste code between projects:

```typescript
// ❌ Without Components - Copy-paste everywhere
export class Application extends BaseApplication {
  preConfigure() {
    // Auth feature - copied to every project
    this.service(TokenService);
    this.service(AuthService);
    this.controller(AuthController);
    this.bind({ key: 'auth.secret' }).toValue(process.env.JWT_SECRET);

    // Health check - copied to every project
    this.controller(HealthController);
    this.service(HealthService);

    // Your actual app code...
  }
}
```

**Components solve this** by packaging related functionality into reusable, plug-and-play modules:

```typescript
// ✅ With Components - Clean and reusable
export class Application extends BaseApplication {
  preConfigure() {
    this.component(AuthenticateComponent);  // All auth features in one line
    this.component(HealthCheckComponent);   // Health check ready to go

    // Your actual app code...
  }
}
```

## Think of Components as "Feature Plugins"

A Component is a **self-contained feature package** that bundles:

| What It Bundles | Example |
|-----------------|---------|
| Services | `TokenService`, `AuthService` |
| Controllers | `AuthController` with login/logout endpoints |
| Repositories | `UserRepository` for auth data |
| Configuration | Default settings, binding keys |
| Middlewares | JWT validation middleware |

When you register a component, all of these get added to your application automatically.

## When Should You Create a Component?

| Scenario | Use Component? | Why |
|----------|----------------|-----|
| Feature used in **one** project only | ❌ No | Just register services/controllers directly |
| Feature **shared across projects** | ✅ Yes | Package once, reuse everywhere |
| Feature with **multiple related parts** | ✅ Yes | Keep related code together |
| Building a **library/package** | ✅ Yes | Easy distribution and installation |
| **Configurable feature** with options | ✅ Yes | Components handle configuration elegantly |

## Creating Your First Component

### Step 1: Identify What to Bundle

Let's create a `NotificationComponent` that provides:
- A service to send notifications
- A controller with REST endpoints
- Configuration options

### Step 2: Create the Component Class

```typescript
// src/components/notification/component.ts
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
  ValueOrPromise,
} from '@venizia/ignis';
import { NotificationService } from './services';
import { NotificationController } from './controllers';

export class NotificationComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private _application: BaseApplication,
  ) {
    super({
      scope: NotificationComponent.name,
      initDefault: { enable: true, container: _application },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Register all component resources with the application
    this._application.service(NotificationService);
    this._application.controller(NotificationController);
  }
}
```

### Step 3: Create the Service

```typescript
// src/components/notification/services/service.ts
import { BaseService } from '@venizia/ignis';

export class NotificationService extends BaseService {
  constructor() {
    super({ scope: NotificationService.name });
  }

  async send(opts: { userId: string; message: string }) {
    // Send notification logic
    console.log(`Sending to ${opts.userId}: ${opts.message}`);
    return { success: true };
  }
}
```

### Step 4: Create the Controller

```typescript
// src/components/notification/controllers/controller.ts
import {
  BaseController,
  controller,
  post,
  inject,
  HTTP,
  jsonContent,
  jsonResponse,
  TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { NotificationService } from '../services';

const NotificationRoutes = {
  SEND: {
    method: HTTP.Methods.POST,
    path: '/send',
    request: {
      body: jsonContent({
        schema: z.object({
          userId: z.string(),
          message: z.string(),
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({ success: z.boolean() }),
    }),
  },
} as const;

@controller({ path: '/notifications' })
export class NotificationController extends BaseController {
  constructor(
    @inject({ key: 'services.NotificationService' })
    private _notificationService: NotificationService,
  ) {
    super({ scope: NotificationController.name, path: '/notifications' });
  }

  @post({ configs: NotificationRoutes.SEND })
  async send(c: TRouteContext) {
    const body = c.req.valid<{ userId: string; message: string }>('json');
    const result = await this._notificationService.send({
      userId: body.userId,
      message: body.message,
    });
    return c.json(result, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### Step 5: Use the Component

```typescript
// src/application.ts
import { NotificationComponent } from './components/notification';

export class Application extends BaseApplication {
  preConfigure() {
    this.component(NotificationComponent);
    // That's it! /notifications/send endpoint is now available
  }
}
```

## Adding Configuration Options

Components become powerful when they accept options. Here's how:

### Step 1: Define Types and Binding Keys in `common/`

**Types go in `types.ts`:**

```typescript
// src/components/notification/common/types.ts
export interface INotificationOptions {
  provider: 'email' | 'sms' | 'push';
  defaultFrom?: string;
  retryCount?: number;
}

export interface INotificationPayload {
  userId: string;
  message: string;
  channel?: string;
}
```

**Binding keys go in `keys.ts`:**

```typescript
// src/components/notification/common/keys.ts
export const NotificationBindingKeys = {
  OPTIONS: 'components.notification.options',
  SERVICE: 'services.NotificationService',
  CONTROLLER: 'controllers.NotificationController',
} as const;
```

**Barrel export in `index.ts`:**

```typescript
// src/components/notification/common/index.ts
export * from './types';
export * from './keys';
```

### Step 2: Use Options in Service

```typescript
// src/components/notification/services/service.ts
import { BaseService, inject } from '@venizia/ignis';
import { INotificationOptions, NotificationBindingKeys } from '../common';

export class NotificationService extends BaseService {
  constructor(
    @inject({ key: NotificationBindingKeys.OPTIONS })
    private _options: INotificationOptions,
  ) {
    super({ scope: NotificationService.name });
  }

  async send(opts: { userId: string; message: string }) {
    console.log(`Sending via ${this._options.provider}: ${opts.message}`);
    // Use this._options.retryCount, this._options.defaultFrom, etc.
    return { success: true };
  }
}
```

### Step 3: Provide Default Options in Component

```typescript
// src/components/notification/component.ts
import { NotificationBindingKeys, INotificationOptions } from './common';

export class NotificationComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private _application: BaseApplication,
  ) {
    super({
      scope: NotificationComponent.name,
      initDefault: { enable: true, container: _application },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Provide default options (can be overridden by user)
    if (!this._application.isBound({ key: NotificationBindingKeys.OPTIONS })) {
      this._application.bind<INotificationOptions>({ key: NotificationBindingKeys.OPTIONS })
        .toValue({
          provider: 'email',
          defaultFrom: 'noreply@example.com',
          retryCount: 3,
        });
    }

    this._application.service(NotificationService);
    this._application.controller(NotificationController);
  }
}
```

### Step 4: Users Can Override Options

```typescript
// In user's application.ts
export class Application extends BaseApplication {
  preConfigure() {
    // Override options BEFORE registering component
    this.bind<INotificationOptions>({ key: NotificationBindingKeys.OPTIONS })
      .toValue({
        provider: 'sms',           // Use SMS instead of email
        retryCount: 5,             // More retries
      });

    this.component(NotificationComponent);
  }
}
```

## Component Lifecycle

```
Application.preConfigure()
         │
         ▼
this.component(MyComponent)
         │
         ▼
┌────────────────────────────────┐
│  1. Constructor called         │
│     - Inject application       │
│     - Set up component scope   │
└────────────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  2. binding() called           │
│     - Register services        │
│     - Register controllers     │
│     - Register repositories    │
│     - Bind default options     │
└────────────────────────────────┘
         │
         ▼
Component resources are now
available in the application
```

## Component Directory Structure

Organize your component files following IGNIS conventions:

**Simple Component:**

```
src/components/notification/
├── index.ts              # Barrel exports
├── component.ts          # IoC binding setup
├── controllers/
│   ├── index.ts          # Barrel exports for controllers
│   └── controller.ts     # Route handlers (or notification.controller.ts)
├── services/
│   ├── index.ts          # Barrel exports for services
│   └── service.ts        # Business logic (or notification.service.ts)
└── common/
    ├── index.ts          # Barrel exports for common
    ├── keys.ts           # Binding key constants
    ├── types.ts          # Interfaces and types
    └── rest-paths.ts     # Route path constants (optional)
```

**Complex Component (with multiple sub-features):**

```
src/components/auth/
├── index.ts
├── component.ts
├── controllers/
│   ├── index.ts
│   ├── auth.controller.ts
│   └── session.controller.ts
├── services/
│   ├── index.ts
│   ├── token.service.ts
│   └── session.service.ts
├── strategies/
│   ├── index.ts
│   ├── jwt.strategy.ts
│   └── basic.strategy.ts
├── common/
│   ├── index.ts
│   ├── keys.ts
│   └── types.ts
└── models/
    ├── entities/
    └── requests/
```

**Barrel exports at every level:**

```typescript
// src/components/notification/index.ts
export * from './common';
export * from './component';
export * from './controllers';
export * from './services';

// src/components/notification/controllers/index.ts
export * from './controller';

// src/components/notification/services/index.ts
export * from './service';

// src/components/notification/common/index.ts
export * from './keys';
export * from './types';
```

**File naming:**
- Use folders: `controllers/`, `services/`, `common/`
- Single file in folder: `controller.ts`, `service.ts`
- Multiple files in folder: `auth.controller.ts`, `token.service.ts`
- Types and keys always in `common/` folder

## Quick Reference

### Minimal Component Template

```typescript
import { BaseApplication, BaseComponent, CoreBindings, inject, ValueOrPromise } from '@venizia/ignis';

export class MyComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private _application: BaseApplication,
  ) {
    super({
      scope: MyComponent.name,
      initDefault: { enable: true, container: _application },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Register your services, controllers, etc.
    this._application.service(MyService);
    this._application.controller(MyController);
  }
}
```

### Component with Options Template

```typescript
import { BaseApplication, BaseComponent, CoreBindings, inject, ValueOrPromise } from '@venizia/ignis';

// 1. Define options interface
export interface IMyComponentOptions {
  enabled: boolean;
  config: string;
}

// 2. Define binding keys
export const MyComponentKeys = {
  OPTIONS: 'components.my.options',
} as const;

// 3. Create component
export class MyComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private _application: BaseApplication,
  ) {
    super({
      scope: MyComponent.name,
      initDefault: { enable: true, container: _application },
    });
  }

  override binding(): ValueOrPromise<void> {
    // Provide defaults if not already bound
    if (!this._application.isBound({ key: MyComponentKeys.OPTIONS })) {
      this._application.bind<IMyComponentOptions>({ key: MyComponentKeys.OPTIONS })
        .toValue({ enabled: true, config: 'default' });
    }

    this._application.service(MyService);
  }
}
```

## Summary

| Concept | Description |
|---------|-------------|
| **Component** | A reusable package that bundles services, controllers, and configuration |
| **When to use** | Shared features, multi-part features, distributable packages |
| **Key method** | `binding()` - register all resources here |
| **Configuration** | Use binding keys + `isBound()` check for overridable options |
| **Registration** | `this.component(MyComponent)` in `preConfigure()` |

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) - What components are
  - [Application](/guides/core-concepts/application/) - Registering components
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - Component bindings

- **References:**
  - [BaseComponent API](/references/base/components) - Complete API reference
  - [Authentication Component](/references/components/authentication/) - Real-world component example
  - [Health Check Component](/references/components/health-check) - Simple component example

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Component architecture patterns
  - [Code Style Standards](/best-practices/code-style-standards/) - Component coding standards
