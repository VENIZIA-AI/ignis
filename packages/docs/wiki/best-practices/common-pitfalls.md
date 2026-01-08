# Common Pitfalls

Avoid these common mistakes when building Ignis applications.

## 1. Forgetting to Register Resources

**Problem:** Created a Controller/Service/Repository but getting `Binding not found` errors.

**Solution:** Register in `application.ts` → `preConfigure()`:

**Example (`src/application.ts`):**
```typescript
// ...
import { MyNewController } from './controllers';
import { MyNewService } from './services';
// ...

export class Application extends BaseApplication {
  // ...
  preConfigure(): ValueOrPromise<void> {
    // DataSources
    this.dataSource(PostgresDataSource);

    // Repositories
    this.repository(ConfigurationRepository);

    // Services
    this.service(MyNewService); // <-- Don't forget this line
    this.registerAuth();

    // Controllers
    this.controller(TestController);
    this.controller(MyNewController); // <-- Or this line

    // Components
    this.component(HealthCheckComponent);
  }
  // ...
}
```

## 2. Incorrect Injection Keys

**Problem:** `Binding not found` when using `@inject`.

**Solution:** Use `BindingKeys.build()` helper:

```typescript
// ✅ GOOD
@inject({
  key: BindingKeys.build({
    namespace: BindingNamespaces.REPOSITORY,
    key: ConfigurationRepository.name,
  }),
})

// ❌ BAD - typo in string (note: "Repository" is misspelled)
@inject({ key: 'repositories.ConfigurationRepository' })
```

## 3. Business Logic in Controllers

**Problem:** Complex logic in controller methods makes them hard to test and maintain.

**Solution:** Move business logic to Services. Controllers should only handle HTTP.

-   **Bad:**
    ```typescript
    import { ApplicationError, getError } from '@venizia/ignis';

    // In a Controller
    async createUser(c: Context) {
        const { name, email, companyName } = c.req.valid('json');
        
        // Complex logic inside the controller
        const existingUser = await this.userRepository.findByEmail(email);
        if (existingUser) {
            throw getError({ message: 'Email already exists' });
        }
        
        const company = await this.companyRepository.findOrCreate(companyName);
        const user = await this.userRepository.create({ name, email, companyId: company.id });
        
        return c.json(user, HTTP.ResultCodes.RS_2.Ok);
    }
    ```
-   **Good:**
    ```typescript
    // In a Controller
    async createUser(c: Context) {
        const userData = c.req.valid('json');
        // Delegate to the service
        const newUser = await this.userService.createUser(userData);
        return c.json(newUser, HTTP.ResultCodes.RS_2.Ok);
    }
    
    // In UserService
    async createUser(data) {
        // All the complex logic now resides in the service
        const existingUser = await this.userRepository.findByEmail(data.email);
        // ...
        return await this.userRepository.create(...);
    }
    ```

## 4. Missing Environment Variables

**Pitfall:** The application fails to start or behaves unexpectedly because required environment variables are not defined in your `.env` file. The framework validates variables prefixed with `APP_ENV_` by default.

**Solution:** Always create a `.env` file for your local development by copying `.env.example`. Ensure all required variables, especially secrets and database connection details, are filled in.

**Example (`.env.example`):**
```
# Ensure these have strong, unique values in your .env file
APP_ENV_APPLICATION_SECRET=
APP_ENV_JWT_SECRET=

# Ensure these point to your local database
APP_ENV_POSTGRES_HOST=0.0.0.0
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=password
APP_ENV_POSTGRES_DATABASE=db
```

## 5. Not Using `as const` for Route Definitions

**Pitfall:** When using the decorator-based routing with a shared `RouteConfigs` object, you forget to add `as const` to the object definition. TypeScript will infer the types too broadly.

**Solution:** Always use `as const` when exporting a shared route configuration object.

**Example (`src/controllers/test/definitions.ts`):**
```typescript
export const RouteConfigs = {
  GET_USERS: { /* ... */ },
  GET_USER_BY_ID: { /* ... */ },
} as const; // <-- This is crucial!
```
This ensures that the route configuration object is treated as a readonly literal, which is important for type safety throughout your application.

## 6. Bulk Operations Without WHERE Clause

**Problem:** Attempting to update or delete all records without an explicit `where` condition.

**Solution:** Ignis prevents accidental bulk data destruction. You must either provide a `where` condition or explicitly set `force: true`.

```typescript
// ❌ BAD - Will throw error
await userRepository.updateBy({
  data: { status: 'INACTIVE' },
  where: {},  // Empty where = targets ALL records
});
// Error: [updateBy] DENY to perform updateBy | Empty where condition

// ✅ GOOD - Explicit where condition
await userRepository.updateBy({
  data: { status: 'INACTIVE' },
  where: { lastLoginAt: { lt: new Date('2024-01-01') } },
});

// ✅ GOOD - Intentionally affect all records with force flag
await userRepository.updateBy({
  data: { status: 'INACTIVE' },
  where: {},
  options: { force: true },  // Explicitly allow empty where
});
```

> [!WARNING]
> The `force: true` flag bypasses the safety check. Only use when you intentionally want to affect ALL records in the table.

## 7. Schema Key Mismatch

**Problem:** Entity name doesn't match the table name registered in the DataSource's schema.

**Error Message:**
```
[UserRepository] Schema key mismatch | Entity name 'User' not found in connector.query | Available keys: [Configuration, Post]
```

**Solution:** Ensure your entity class name matches the table name in `pgTable()`:

```typescript
// ❌ BAD - Class name 'User' doesn't match table name 'users'
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('users', { /* ... */ });  // Lowercase 'users'
}

// ✅ GOOD - Class name matches table name
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', { /* ... */ });  // Matches class name
}
```

**Why this matters:** The framework uses `entity.name` (class name) to look up the query interface in `connector.query`. If they don't match, the repository can't find its table.

## 8. Validation Error Response Structure

**Problem:** Client receives validation errors but doesn't know how to parse them.

**Solution:** Understand the Zod validation error response format:

```json
{
  "statusCode": 422,
  "message": "ValidationError",
  "requestId": "abc123",
  "details": {
    "cause": [
      {
        "path": "email",
        "message": "Invalid email",
        "code": "invalid_string",
        "expected": "email",
        "received": "string"
      },
      {
        "path": "age",
        "message": "Expected number, received string",
        "code": "invalid_type",
        "expected": "number",
        "received": "string"
      }
    ]
  }
}
```

**Client-side handling:**
```typescript
try {
  await api.post('/users', data);
} catch (error) {
  if (error.response?.status === 422) {
    const errors = error.response.data.details.cause;
    errors.forEach(err => {
      console.log(`Field '${err.path}': ${err.message}`);
    });
  }
}
```

## 9. Circular Dependency Issues

**Problem:** Application fails to start with `Cannot access 'X' before initialization` or similar errors.

**Cause:** Two or more modules import each other directly, creating a circular reference that JavaScript cannot resolve.

**Solution:** Use lazy imports or restructure your modules:

```typescript
// ❌ BAD - Direct import causes circular dependency
import { UserService } from './user.service';

@model({ type: 'entity' })
export class Order extends BaseEntity<typeof Order.schema> {
  static override relations = (): TRelationConfig[] => [
    { schema: User.schema, ... }, // User imports Order, Order imports User
  ];
}

// ✅ GOOD - Lazy import breaks the cycle
@model({ type: 'entity' })
export class Order extends BaseEntity<typeof Order.schema> {
  static override relations = (): TRelationConfig[] => {
    const { User } = require('./user.model'); // Lazy require
    return [{ schema: User.schema, ... }];
  };
}
```

**Alternative:** Restructure to have a shared module that both import from.

## 10. Transaction Not Rolling Back

**Problem:** Errors occur but database changes are still persisted.

**Cause:** Transaction not properly wrapped in try-catch, or rollback not called on error.

**Solution:** Always wrap transactions in try-catch with explicit rollback:

```typescript
// ❌ BAD - No error handling
const tx = await repo.beginTransaction();
await repo.create({ data, options: { transaction: tx } });
await tx.commit(); // If create fails, commit is never called but neither is rollback

// ✅ GOOD - Proper transaction handling
const tx = await repo.beginTransaction();
try {
  await repo.create({ data, options: { transaction: tx } });
  await otherRepo.update({ data: other, options: { transaction: tx } });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error; // Re-throw to let caller handle
}
```

## 11. Fire-and-Forget Promises Losing Context

**Problem:** `getCurrentUserId()` or other context-dependent functions return `null` in background tasks.

**Cause:** When you fire-and-forget a promise, it runs outside the original async context where the user was authenticated.

**Solution:** Pass required context data explicitly to background tasks:

```typescript
// ❌ BAD - Context lost in fire-and-forget
@post({ configs: RouteConfigs.CREATE_ORDER })
async createOrder(c: Context) {
  const data = c.req.valid('json');
  const order = await this.orderService.create(data);

  // Fire-and-forget: sendNotification runs outside request context
  this.notificationService.sendOrderConfirmation(order.id);
  // Inside sendOrderConfirmation, getCurrentUserId() returns null!

  return c.json(order);
}

// ✅ GOOD - Pass user ID explicitly
@post({ configs: RouteConfigs.CREATE_ORDER })
async createOrder(c: Context) {
  const data = c.req.valid('json');
  const userId = c.get(Authentication.AUDIT_USER_ID);
  const order = await this.orderService.create(data);

  // Pass userId explicitly to background task
  this.notificationService.sendOrderConfirmation(order.id, userId);

  return c.json(order);
}
```

> [!WARNING]
> This is especially important when using `allowAnonymous: false` in user audit columns. The enricher will throw an error if it cannot find the user context.

## 12. Incorrect Relation Configuration

**Problem:** Relations return empty arrays or `null` unexpectedly.

**Cause:** Mismatch between `fields` and `references` in relation metadata.

**Solution:** Double-check that foreign keys point to the correct columns:

```typescript
// ❌ BAD - fields and references swapped
static override relations = (): TRelationConfig[] => [
  {
    name: 'posts',
    type: RelationTypes.MANY,
    schema: Post.schema,
    metadata: {
      fields: [Post.schema.authorId],     // Wrong! This should be User.schema.id
      references: [User.schema.id],        // Wrong! This should be Post.schema.authorId
    },
  },
];

// ✅ GOOD - Correct configuration
// "User has many Posts where User.id = Post.authorId"
static override relations = (): TRelationConfig[] => [
  {
    name: 'posts',
    type: RelationTypes.MANY,
    schema: Post.schema,
    metadata: {
      fields: [User.schema.id],            // Parent's key
      references: [Post.schema.authorId],  // Child's foreign key
    },
  },
];
```

**Rule of thumb:** `fields` is the key on the current entity, `references` is the key on the related entity.

## 13. Overwriting Data with Partial Updates

**Problem:** PATCH endpoint replaces entire record instead of merging fields.

**Cause:** Using `create()` or full `update()` instead of partial update methods.

**Solution:** Use `updateById()` which only updates provided fields:

```typescript
// ❌ BAD - Overwrites all fields (if using raw insert/update)
await db.update(users).set(data).where(eq(users.id, id));
// If data = { name: 'New' }, email and other fields might be set to undefined

// ✅ GOOD - Repository updateById only updates provided fields
await userRepository.updateById({
  id: userId,
  data: { name: 'New Name' }, // Only updates 'name', leaves other fields intact
});
```

## See Also

- [Troubleshooting Tips](./troubleshooting-tips) - Debug common issues
- [Error Handling](./error-handling) - Proper error handling patterns
- [Architecture Decisions](./architecture-decisions) - Avoid design mistakes