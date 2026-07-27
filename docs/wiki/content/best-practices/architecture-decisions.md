# Architecture Decisions Guide

This guide helps you make informed architectural decisions when building applications with IGNIS. Learn when to use different patterns and how to scale your application.

## Common Decision Points

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Service layer? | Direct repo vs Service | Use Service for business logic |
| Component vs inline? | Reusable vs one-off | Component if used 2+ times |
| Repository methods? | CRUD only vs custom | Start CRUD, add custom as needed |
| Error handling? | Service vs Controller | Handle in Controller, log in Service |
| Transactions? | Manual vs automatic | Use repository transaction support |

---

## 1. When to Use Services vs Direct Repository

### Use Direct Repository Access When:

```typescript
// Simple CRUD with no business logic
@controller({ path: '/items' })
export class ItemController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.ItemRepository' })
    private itemRepository: ItemRepository,
  ) {
    super({ scope: ItemController.name, path: '/items' });
  }

  @get({ configs: RouteConfigs.GET_ITEM_BY_ID })
  async getItem(c: Context) {
    const item = await this.itemRepository.findById({ id: c.req.param('id') });
    return c.json(item);
  }
}
```

**Good for:**
- Simple read operations
- Basic CRUD endpoints
- Prototypes and MVPs
- Admin panels

### Use Service Layer When:

```typescript
// Complex business logic needs a service
@controller({ path: '/orders' })
export class OrderController extends BaseRestController {
  constructor(
    @inject({ key: 'services.OrderService' })
    private orderService: OrderService,
  ) {
    super({ scope: OrderController.name, path: '/orders' });
  }

  @post({ configs: RouteConfigs.CREATE_ORDER })
  async createOrder(c: Context) {
    const data = await c.req.json();
    // Service handles: validation, inventory check, payment, notifications
    const order = await this.orderService.createOrder(data);
    return c.json(order, 201);
  }
}
```

**Good for:**
- Multiple repository interactions
- External service calls (payments, email)
- Complex validation rules
- Transaction management
- Business rule enforcement

### Decision Matrix

| Scenario | Repository | Service |
|----------|------------|---------|
| Get user by ID | Yes | No |
| Create order with payment | No | Yes |
| List products with filters | Yes | No |
| User registration with email | No | Yes |
| Update product price | Yes | Maybe |
| Process refund | No | Yes |

---

## 2. When to Create Components

### Create a Component When:

1. **Functionality is used across multiple applications**
2. **Feature is self-contained with its own configuration**
3. **You want to share with the team/community**

```typescript
// Component: Self-contained, configurable, reusable
export class NotificationComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: NotificationComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        // Default configuration - applications can rebind to override
        'notification.options': Binding.bind({ key: 'notification.options' }).toValue({
          email: { enabled: true },
          sms: { enabled: false },
        }),
      },
    });
  }

  // Called when the application configures components (registerComponents)
  override binding(): void {
    const options = this.application.get({ key: 'notification.options' });
    // Register notification services based on the resolved options
    this.application.service(EmailNotificationService);
  }
}
```

### Keep Inline When:

1. **Feature is specific to one application**
2. **Logic is simple and unlikely to change**
3. **No configuration needed**

```typescript
// Inline: Simple, one-off, no need for abstraction
@controller({ path: '/health' })
export class HealthController extends BaseRestController {
  constructor() {
    super({ scope: HealthController.name, path: '/health' });
  }

  @get({ configs: RouteConfigs.HEALTH_CHECK })
  healthCheck(c: Context) {
    return c.json({ status: 'ok', timestamp: new Date() });
  }
}
```

### Component vs Service vs Inline

| Pattern | Scope | Reusability | Configuration |
|---------|-------|-------------|---------------|
| **Component** | Cross-app | High | External config |
| **Service** | Single app | Medium | Internal |
| **Inline** | Single controller | None | None |


## 3. Repository Method Design

### Start with Standard CRUD

Every repository gets these methods from `DefaultRelationalRepository`:

```typescript
// Inherited methods (options-object API) - use these first
find({ filter })            // List with filters -> T[]
findById({ id })            // Get by ID -> T | null
findOne({ filter })         // Get first match -> T | null
count({ where })            // Count matches -> { count }
existsWith({ where })       // Existence check -> boolean

create({ data })            // Create new -> { count, data }
createAll({ data })         // Create many -> { count, data }
updateById({ id, data })    // Update existing -> { count, data }
updateAll({ data, where })  // Bulk update (updateBy is an alias)
deleteById({ id })          // Delete -> { count, data }
deleteAll({ where })        // Bulk delete (deleteBy is an alias)
```

Reads return the record(s) directly; writes return `{ count, data }`. Pass `options: { shouldReturn: false }` on a write to skip the `RETURNING` round-trip.

### Add Custom Methods When:

1. **Query is complex and reusable**
2. **Business logic belongs at data layer**
3. **Performance optimization needed**

```typescript
// Custom repository methods
export class OrderRepository extends DefaultRelationalRepository<typeof Order.schema> {
  // Complex query that's used in multiple places
  async findPendingOrdersOlderThan(hours: number) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
      filter: {
        where: {
          status: 'pending',
          createdAt: { lt: cutoff },
        },
        order: ['createdAt ASC'],
      },
    });
  }

  // Performance-optimized query (raw SQL through the Drizzle connector)
  async getOrderStats(userId: string) {
    return this.dataSource.connector.execute(sql`
      SELECT
        COUNT(*) as total,
        SUM(total) as revenue,
        AVG(total) as average
      FROM orders
      WHERE user_id = ${userId}
    `);
  }

  // Business logic at data layer
  async softDelete(id: string) {
    return this.updateById({
      id,
      data: {
        deletedAt: new Date(),
        status: 'deleted',
      },
    });
  }
}
```


## 4. Error Handling Strategy

### Controller Level: Format Response

```typescript
@controller({ path: '/users' })
export class UserController extends BaseRestController {
  @post({ configs: RouteConfigs.CREATE_USER })
  async createUser(c: Context) {
    try {
      const data = await c.req.json();
      const user = await this.userService.create(data);
      return c.json(user, 201);
    } catch (error) {
      // Format error for API response -- the code is always lower-cased by ApplicationError
      if (isApplicationError(error) && error.normalized.code === 'app.user.duplicate_email') {
        return c.json({ error: 'Email already exists' }, 400);
      }
      throw error; // Let global handler catch unknown errors
    }
  }
}
```

### Service Level: Throw Domain Errors

```typescript
export class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  async create(data: CreateUserInput) {
    // Validate and throw domain-specific errors
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      // One message shape everywhere: { text, code, args }
      throw getError({
        statusCode: 400,
        message: {
          text: 'User with this email already exists',
          code: MessageCode.build({ parts: ['app', 'user', 'duplicate_email'] }),
          args: { email: data.email },
        },
      });
    }

    // Log operations
    this.logger.info('Creating user | email: %s', data.email);

    return this.userRepository.create({ data });
  }
}
```

### Repository Level: Let Errors Bubble

```typescript
export class UserRepository extends DefaultRelationalRepository<typeof User.schema> {
  // Don't catch database errors here
  // Let them bubble up to service/controller
  async findByEmail(email: string) {
    return this.findOne({ filter: { where: { email } } });
  }
}
```

### Error Handling Flow

```
Repository (DB errors)
    ↓ bubbles up
Service (catches, transforms to domain errors, logs)
    ↓ throws
Controller (catches, formats for API response)
    ↓ responds
Client (receives formatted error)
```


## 5. Scaling Decisions

### When to Split Services

**Before:**
```typescript
// Monolithic service doing too much
class UserService {
  async register(data) { /* ... */ }
  async login(data) { /* ... */ }
  async updateProfile(data) { /* ... */ }
  async sendPasswordReset(email) { /* ... */ }
  async verifyEmail(token) { /* ... */ }
  async sendWelcomeEmail(userId) { /* ... */ }
}
```

**After:**
```typescript
// Split by domain
class AuthService {
  async register(data) { /* ... */ }
  async login(data) { /* ... */ }
  async sendPasswordReset(email) { /* ... */ }
}

class ProfileService {
  async updateProfile(data) { /* ... */ }
  async verifyEmail(token) { /* ... */ }
}

class NotificationService {
  async sendWelcomeEmail(userId) { /* ... */ }
}
```

### Signs You Need to Split

| Symptom | Solution |
|---------|----------|
| Service > 500 lines | Split by domain |
| > 10 dependencies | Extract sub-services |
| Circular dependencies | Restructure or use events |
| Hard to test | Smaller, focused services |

### Microservices vs Monolith

| Factor | Stay Monolith | Consider Microservices |
|--------|---------------|------------------------|
| Team size | < 10 developers | > 20 developers |
| Deployment | Single deploy OK | Need independent deploys |
| Scale | Uniform scaling | Different scaling needs |
| Data | Shared database OK | Need data isolation |
| Complexity | Keep simple | Worth the overhead |


## 6. Data Access Patterns

### Repository per Aggregate

```typescript
// Good: One repository per aggregate root
OrderRepository       // Manages Order + OrderItems
UserRepository        // Manages User + UserSettings
ProductRepository     // Manages Product + ProductVariants
```

### Avoid: Repository per Table

```typescript
// Avoid: Too granular, leads to anemic domain model
OrderRepository
OrderItemRepository    // Should be part of OrderRepository
OrderStatusRepository  // Probably doesn't need its own repo
```

### When to Use Raw Queries

```typescript
// Use repository methods for most cases
const orders = await orderRepository.find({ filter: { where: { userId } } });

// Use raw queries (via the datasource's Drizzle connector) for:
const connector = this.dataSource.connector;

// 1. Complex aggregations
const stats = await connector.execute(sql`
  SELECT category, COUNT(*), AVG(price)
  FROM products
  GROUP BY category
`);

// 2. Performance-critical paths
const results = await connector.execute(sql`
  SELECT * FROM products
  WHERE tsv @@ plainto_tsquery(${search})
  LIMIT 10
`);

// 3. Database-specific features
const nearby = await connector.execute(sql`
  SELECT * FROM stores
  WHERE ST_DWithin(location, ${point}, 5000)
`);
```


## 7. Configuration Strategy

### Environment Variables

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

// Use for: secrets, environment-specific values
const config = {
  database: {
    host: applicationEnvironment.get<string>('APP_ENV_POSTGRES_HOST'),
    password: applicationEnvironment.get<string>('APP_ENV_POSTGRES_PASSWORD'),
  },
  stripe: {
    secretKey: applicationEnvironment.get<string>('APP_ENV_STRIPE_SECRET_KEY'),
  },
};
```

### Application Config

```typescript
// Use for: application defaults, feature flags
const appConfig = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  features: {
    enableBetaFeatures: process.env.NODE_ENV !== 'production',
  },
};
```

### Component Config

```typescript
// Use for: component-specific settings
// Components read their options from bindings - rebind before registering
this.bind<IApiReferenceOptions>({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS }).toValue({
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'swagger' },
  },
  explorer: {
    openapi: '3.1.0',
    info: { title: 'My API', version: '1.0.0', description: 'My API documentation' },
  },
});
this.component(ApiReferenceComponent);
```


## 8. Testing Strategy

### What to Test at Each Layer

| Layer | Test Type | Focus |
|-------|-----------|-------|
| **Controller** | Integration | HTTP, validation, response format |
| **Service** | Unit | Business logic, edge cases |
| **Repository** | Integration | Queries, data integrity |
| **Component** | Unit | Configuration, lifecycle |

### Test Pyramid

```
        /\
       /  \      E2E (few)
      /----\
     /      \    Integration (some)
    /--------\
   /          \  Unit (many)
  --------------
```


## Quick Reference

### Checklist for New Features

1. **[ ] Is it cross-cutting?** → Component
2. **[ ] Has business logic?** → Service
3. **[ ] Simple CRUD?** → Repository directly
4. **[ ] Reusable query?** → Custom repository method
5. **[ ] Complex validation?** → Service layer
6. **[ ] External API?** → Service with error handling
7. **[ ] Needs transactions?** → Service orchestrating repos

### Common Mistakes to Avoid

| Mistake | Better Approach |
|---------|-----------------|
| Fat controllers | Move logic to services |
| Anemic services | Add business logic, not just pass-through |
| Repository per table | Repository per aggregate |
| Catching all errors | Let appropriate errors bubble |
| Premature optimization | Start simple, optimize when needed |
| Over-engineering | YAGNI - build what you need now |


## See Also

- [Architectural Patterns](./architectural-patterns.md) - Layered architecture details
- [Core Concepts](../guides/core-concepts/application/) - Framework fundamentals
- [Performance Optimization](./performance-optimization.md) - Scaling techniques
