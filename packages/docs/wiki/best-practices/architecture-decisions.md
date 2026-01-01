# Architecture Decisions Guide

This guide helps you make informed architectural decisions when building applications with Ignis. Learn when to use different patterns and how to scale your application.

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
export class ItemController extends BaseController {
  constructor(
    @inject('repositories.ItemRepository')
    private itemRepo: ItemRepository,
  ) {
    super({ scope: 'ItemController', path: '/items' });
  }

  @get({ configs: { path: '/:id' } })
  async getItem(c: Context) {
    const item = await this.itemRepo.findById(c.req.param('id'));
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
export class OrderController extends BaseController {
  constructor(
    @inject('services.OrderService')
    private orderService: OrderService,
  ) {
    super({ scope: 'OrderController', path: '/orders' });
  }

  @post({ configs: { path: '/' } })
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
@component({ scope: 'NotificationComponent' })
export class NotificationComponent extends BaseComponent {
  private emailService: EmailService;
  private smsService: SMSService;
  private pushService: PushService;

  override configure() {
    // Setup services based on configuration
    this.emailService = new EmailService(this.config.email);
    if (this.config.sms?.enabled) {
      this.smsService = new SMSService(this.config.sms);
    }
  }

  async notify(opts: NotifyOptions) {
    // Unified notification API
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
export class HealthController extends BaseController {
  @get({ configs: { path: '/' } })
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

---

## 3. Repository Method Design

### Start with Standard CRUD

Every repository gets these methods from `BaseRepository`:

```typescript
// Inherited methods - use these first
find(filter)      // List with filters
findById(id)      // Get by ID
findOne(filter)   // Get first match
create(data)      // Create new
updateById(id, data)  // Update existing
deleteById(id)    // Delete
count(filter)     // Count matches
```

### Add Custom Methods When:

1. **Query is complex and reusable**
2. **Business logic belongs at data layer**
3. **Performance optimization needed**

```typescript
// Custom repository methods
export class OrderRepository extends BaseRepository<Order> {
  // Complex query that's used in multiple places
  async findPendingOrdersOlderThan(hours: number) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Performance-optimized query
  async getOrderStats(userId: string) {
    return this.db.execute(sql`
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
    return this.updateById(id, {
      deletedAt: new Date(),
      status: 'deleted',
    });
  }
}
```

---

## 4. Error Handling Strategy

### Controller Level: Format Response

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {
  @post({ configs: { path: '/' } })
  async createUser(c: Context) {
    try {
      const data = await c.req.json();
      const user = await this.userService.create(data);
      return c.json(user, 201);
    } catch (error) {
      // Format error for API response
      if (error.code === 'DUPLICATE_EMAIL') {
        return c.json({ error: 'Email already exists' }, 400);
      }
      throw error; // Let global handler catch unknown errors
    }
  }
}
```

### Service Level: Throw Domain Errors

```typescript
@injectable()
export class UserService extends BaseService {
  async create(data: CreateUserInput) {
    // Validate and throw domain-specific errors
    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) {
      throw getError({
        statusCode: 400,
        code: 'DUPLICATE_EMAIL',
        message: 'User with this email already exists',
      });
    }

    // Log operations
    this.logger.info('Creating user', { email: data.email });

    return this.userRepo.create(data);
  }
}
```

### Repository Level: Let Errors Bubble

```typescript
export class UserRepository extends BaseRepository<User> {
  // Don't catch database errors here
  // Let them bubble up to service/controller
  async findByEmail(email: string) {
    return this.findOne({ where: { email } });
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

---

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

---

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
const orders = await orderRepo.find({ where: { userId } });

// Use raw queries for:
// 1. Complex aggregations
const stats = await db.execute(sql`
  SELECT category, COUNT(*), AVG(price)
  FROM products
  GROUP BY category
`);

// 2. Performance-critical paths
const results = await db.execute(sql`
  SELECT * FROM products
  WHERE tsv @@ plainto_tsquery(${search})
  LIMIT 10
`);

// 3. Database-specific features
const nearby = await db.execute(sql`
  SELECT * FROM stores
  WHERE ST_DWithin(location, ${point}, 5000)
`);
```

---

## 7. Configuration Strategy

### Environment Variables

```typescript
// Use for: secrets, environment-specific values
const config = {
  database: {
    host: EnvHelper.get('APP_ENV_POSTGRES_HOST'),
    password: EnvHelper.get('APP_ENV_POSTGRES_PASSWORD'),
  },
  stripe: {
    secretKey: EnvHelper.get('STRIPE_SECRET_KEY'),
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
this.component(SwaggerComponent, {
  title: 'My API',
  version: '1.0.0',
  path: '/doc',
});
```

---

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

---

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

---

## See Also

- [Architectural Patterns](./architectural-patterns.md) - Layered architecture details
- [Core Concepts](../guides/core-concepts/application/) - Framework fundamentals
- [Performance Optimization](./performance-optimization.md) - Scaling techniques
