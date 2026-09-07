---
title: Services Reference
description: Technical reference for BaseService and the business logic layer in IGNIS
difficulty: beginner
---

# Deep Dive: Services

Technical reference for `BaseService` - the foundation for the business logic layer in IGNIS.

**File:** `packages/kernel/src/base/services/base.ts`

## Quick Reference

| Feature | Detail |
|---------|--------|
| **Import** | `import { BaseService, inject } from '@venizia/ignis'` |
| **Extends** | `BaseHelper` from `@venizia/ignis-helpers` |
| **Logging** | `this.logger` (scoped to constructor `scope`) |
| **Registration** | `this.service(MyService)` in application lifecycle |
| **Binding key** | `services.{ClassName}` (e.g., `services.AuthenticationService`) |
| **DI decorator** | None on the class itself - only `@inject` on constructor parameters or properties |
| **CRUD service** | Removed - use `DefaultCRUDRepository` for data access |

---

## `BaseService` Class

Abstract class that all application services must extend.

```typescript
// packages/kernel/src/base/services/base.ts
import { BaseHelper } from '@venizia/ignis-helpers';
import { IService } from './types';

export abstract class BaseService extends BaseHelper implements IService {
  constructor(opts: { scope: string }) {
    super({ scope: opts.scope });
  }
}
```

`BaseHelper` wires a scoped logger at `this.logger`. Pass `scope: ClassName.name` so log lines are tagged with the service name.

### `IService` Interface

Marker interface with no required methods - it exists purely for type-level contracts:

```typescript
export interface IService {}
```

---

## Registering a Service

Services are registered imperatively in an application lifecycle method. No class decorator is involved - `this.service()` creates the binding and handles everything.

```typescript
// In your Application class (e.g., in preConfigure())
this.service(AuthenticationService);  // binds as 'services.AuthenticationService'
this.service(GreeterService);         // binds as 'services.GreeterService'
```

`this.service(Ctor)` is implemented on the kernel's `RestApplication`, which `BaseApplication` extends:

```typescript
// packages/kernel/src/base/applications/rest.ts
service<Base extends IService>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
  const key = BindingKeys.build(
    opts?.binding ?? { namespace: BindingNamespaces.SERVICE, key: ctor.name }, // 'services.<ClassName>'
  );
  this.assertNoBindingCollision({ key, allowOverride: opts?.allowOverride, caller: this.service.name });

  return this.bind<Base>({ key }).toClass(ctor);
}
```

The resulting binding key defaults to `services.{ClassName}` (overridable via `opts.binding`).

### Lifecycle Placement

Register services before anything that depends on them. The correct hook is `preConfigure()`, or a private helper called from `preConfigure()`:

```typescript
export class Application extends BaseApplication {
  preConfigure(): void {
    // DataSources and repositories that services depend on must come first
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);

    // Then register services
    this.service(AuthenticationService);
  }
}
```

---

## Dependency Injection into Services

Inject repositories, other services, or datasources via `@inject` in the constructor. Two equivalent key forms are available:

### String-literal keys

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { UserRepository } from '../repositories';
import { JWKSIssuerTokenService } from '@venizia/ignis';

export class AuthenticationService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,

    @inject({ key: 'services.JWKSIssuerTokenService' })
    private jwksTokenService: JWKSIssuerTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }
}
```

### Programmatic keys with `BindingKeys.build`

`BindingKeys.build({ namespace, key })` produces the same `namespace.key` string. Use this form when you want a compile-time reference to a class name rather than a plain string:

```typescript
import { BaseService, BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import { UserRepository } from '../repositories';

export class AuthenticationService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,   // 'repositories'
        key: UserRepository.name,                  // 'UserRepository'
      }),
    })
    private userRepository: UserRepository,
  ) {
    super({ scope: AuthenticationService.name });
  }
}
```

Both forms produce identical binding keys at runtime. The `BindingKeys.build` form avoids typo risk when the class name changes.

### Available `BindingNamespaces`

| Constant | Value |
|----------|-------|
| `BindingNamespaces.SERVICE` | `'services'` |
| `BindingNamespaces.REPOSITORY` | `'repositories'` |
| `BindingNamespaces.DATASOURCE` | `'datasources'` |
| `BindingNamespaces.CONTROLLER` | `'controllers'` |
| `BindingNamespaces.COMPONENT` | `'components'` |
| `BindingNamespaces.PROVIDER` | `'providers'` |

---

## Logging

`BaseService` inherits `this.logger` from `BaseHelper`. Log with method scope for structured output:

```typescript
export class AuthenticationService extends BaseService {
  async signIn(opts: { identifier: string }): Promise<string> {
    // Method-scoped log - produces tag "[signIn]" in log output
    this.logger.for('signIn').info('SignIn called | identifier: %s', opts.identifier);

    // ... business logic ...

    this.logger.for('signIn').info('SignIn successful');
    return token;
  }
}
```

Use `this.logger.for('methodName')` to scope log lines to the current method. This matches the project-wide convention seen in all examples.

---

## Service-to-Service Composition

Services can inject other services to compose business logic. Inject them the same way as repositories, using the `services.*` namespace:

```typescript
import { BaseService, BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';

export class OrderService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: OrderRepository.name,
      }),
    })
    private orderRepository: OrderRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: InventoryRepository.name,
      }),
    })
    private inventoryRepository: InventoryRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: NotificationService.name,
      }),
    })
    private notificationService: NotificationService,
  ) {
    super({ scope: OrderService.name });
  }

  async createOrder(opts: { userId: string; items: OrderItem[] }): Promise<Order> {
    this.logger.for('createOrder').info('Creating order | userId: %s', opts.userId);

    const { data: order } = await this.orderRepository.create({ data: opts });

    // Compose with another service
    await this.notificationService.sendOrderConfirmation({ orderId: order.id });

    return order;
  }
}
```

Register both services in `preConfigure()`:

```typescript
this.service(NotificationService);
this.service(OrderService);
```

### Abstract Base Services

For shared dependencies across multiple related services, define an abstract base. The container only ever `instantiate()`s the **concrete** class - `this.service(UserAuditTestService)` registers `UserAuditTestService`, never `BaseTestService`. The hard DI rule - every constructor parameter of a container-instantiated class must carry `@inject` - applies to that concrete constructor.

A `scope: string` is not something the container can supply, so it cannot appear as a parameter on the concrete class at all. `examples/vert`'s test services solve this by never declaring `scope` as a parameter: the concrete class hardcodes its own name and forwards it through `super()`, alongside every shared repository. Each repository stays `@inject`-decorated on both classes - the base declares it to store it, the concrete class repeats it because the container calls the concrete constructor, never the base's:

```typescript
export abstract class BaseTestService extends BaseService {
  constructor(
    scope: string,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    protected readonly userRepository: UserRepository,
    // ...one @inject parameter per other shared repository
  ) {
    super({ scope });
  }

  abstract run(): Promise<void>;

  // Bundles the shared repositories for case-group classes to consume
  protected caseContext(): ITestCaseContext {
    return {
      logger: this.logger,
      logCase: title => this.logCase(title),
      userRepository: this.userRepository,
    };
  }
}

// Repeats the base's @inject parameters - the container calls THIS constructor,
// never the base's - and hardcodes the scope BaseTestService cannot take as a parameter
export class UserAuditTestService extends BaseTestService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    userRepository: UserRepository,
  ) {
    super(UserAuditTestService.name, userRepository);
  }

  async run(): Promise<void> {
    const context = this.caseContext();
    // ...build case-group instances from context and run their cases
  }
}
```

Register the concrete class - never the abstract base:

```typescript
this.service(UserAuditTestService);
```

> [!IMPORTANT]
> `BaseTestService`'s own constructor is never processed by the container - `BaseTestService` is abstract and is never passed to `instantiate()`. Only the concrete class the container actually instantiates is subject to the "every parameter decorated" rule. See [Dependency Injection Reference](./dependency-injection.md#instantiation-algorithm-two-phase) for the full rule.

---

## Transaction Orchestration

Services are the correct place to manage transactions that span multiple repository calls. Begin a transaction on the DataSource and pass it through repository options:

```typescript
import { BaseService, BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import { PostgresDataSource } from '../datasources';

export class CheckoutService extends BaseService {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    private dataSource: PostgresDataSource,

    @inject({ key: 'repositories.OrderRepository' })
    private orderRepository: OrderRepository,

    @inject({ key: 'repositories.InventoryRepository' })
    private inventoryRepository: InventoryRepository,
  ) {
    super({ scope: CheckoutService.name });
  }

  async placeOrder(opts: { userId: string; items: OrderItem[] }): Promise<Order> {
    const log = this.logger.for('placeOrder');
    const transaction = await this.dataSource.beginTransaction();

    try {
      const { data: order } = await this.orderRepository.create({
        data: { userId: opts.userId },
        options: { transaction },
      });

      for (const item of opts.items) {
        await this.inventoryRepository.updateById({
          id: item.productId,
          data: { stock: item.quantity },
          options: { transaction },
        });
      }

      await transaction.commit();
      log.info('Order placed | orderId: %s', order.id);
      return order;
    } catch (error) {
      await transaction.rollback();
      log.error('Order failed, rolled back | error: %s', error);
      throw error;
    }
  }
}
```

Pass `{ transaction }` in the `options` field of any repository call. The repository API is identical with or without a transaction - only the underlying Drizzle connector switches.

---

## Resolving a Service Imperatively

When you need to pull a service out of the container at runtime (rather than through constructor injection), use `this.get<T>`:

```typescript
// In Application.postConfigure() or a lifecycle hook
const testService = this.get<RowLockingTestService>({
  key: BindingKeys.build({
    namespace: BindingNamespaces.SERVICE,
    key: RowLockingTestService.name,
  }),
});

await testService.run();
```

This is useful for post-start hooks, one-off tasks that run after the server starts, or when the service is not a constructor dependency.

---

## No Built-in CRUD Service

IGNIS intentionally does not provide a `BaseCrudService`. CRUD operations belong in the Repository layer (`DefaultCRUDRepository`). Services exist for business logic that cannot be expressed as pure data access: cross-cutting validation, multi-repository coordination, transaction management, and workflow orchestration.

---

## Provider vs Service

| Aspect | Service | Provider |
|--------|---------|----------|
| **Purpose** | Business logic and orchestration | Factory - produces values or instances |
| **Base class** | `BaseService` | `BaseProvider<T>` |
| **Key method** | Business methods | `value(container): T` |
| **Pattern** | Singleton in DI scope | Factory pattern |
| **Registration** | `this.service(Ctor)` | `this.bind(...).toProvider(Ctor)` |

See [Providers Reference](./providers.md) for the factory pattern details.

---

## See Also

- **Related References:**
  - [Controllers](./controllers.md) - HTTP handlers that call services
  - [Repositories](./repositories/) - Data access layer injected into services
  - [Providers](./providers.md) - Factory pattern, compare with services
  - [Dependency Injection](./dependency-injection.md) - Container and injection system

- **Guides:**
  - [Building Services](/guides/core-concepts/services.md)
  - [Dependency Injection Guide](/guides/core-concepts/dependency-injection.md)

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns)
  - [Testing Guide](/guides/tutorials/testing)
