# Common Pitfalls

Avoid these common mistakes when building IGNIS applications.

## 1. Forgetting to Register Resources

**Problem:** Created a Controller/Service/Repository but getting `Binding not found` errors.

**Cause:** The class is not in the artifact index. One of these is missing:

- The decorator on the class: `@controller`, `@service()`, `@repository`, `@datasource` or `@component()`.
- A place under the scanned `src` folder. A file outside it is never found.
- `artifacts: AutoArtifacts` in the application config.

**Solution:** Decorate the class and make sure the config passes the artifacts:

```typescript
// src/services/my-new.service.ts
@service()
export class MyNewService extends BaseService {}

// src/application.ts
import AutoArtifacts from '@venizia/ignis-boot/auto';

export const appConfigs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: AutoArtifacts,
};
```

The class must be a named export. See [Registering artifacts](/guides/core-concepts/application/bootstrapping).

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
@inject({ key: 'repositories.ConfigurationRepositry' })
```

## 3. Business Logic in Controllers

**Problem:** Complex logic in controller methods makes them hard to test and maintain.

**Solution:** Move business logic to Services. Controllers should only handle HTTP.

-   **Bad:**
    ```typescript
    import { post, type TRouteContext } from '@venizia/ignis';
    import { getError, HTTP } from '@venizia/ignis-helpers';

    // In a Controller
    @post({ configs: RouteConfigs.CREATE_USER })
    async createUser(context: TRouteContext) {
      const { name, email, companyName } = context.req.valid<TCreateUser>('json');

      // Complex logic inside the controller
      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser) {
        throw getError({ message: 'Email already exists' });
      }

      const company = await this.companyRepository.findOrCreate(companyName);
      const user = await this.userRepository.create({
        data: { name, email, companyId: company.id },
      });

      return context.json(user, HTTP.ResultCodes.RS_2.Created);
    }
    ```
-   **Good:**
    ```typescript
    // In a Controller
    @post({ configs: RouteConfigs.CREATE_USER })
    async createUser(context: TRouteContext) {
      const userData = context.req.valid<TCreateUser>('json');
      // Delegate to the service
      const newUser = await this.userService.createUser(userData);
      return context.json(newUser, HTTP.ResultCodes.RS_2.Created);
    }

    // In UserService
    async createUser(data) {
      // All the complex logic now resides in the service
      const existingUser = await this.userRepository.findByEmail(data.email);
      // ...
      return await this.userRepository.create({ data });
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

**Solution:** IGNIS prevents accidental bulk data destruction. You must either provide a `where` condition or explicitly set `force: true`.

```typescript
// ❌ BAD - Will throw error
await userRepository.updateBy({
  data: { status: 'INACTIVE' },
  where: {},  // Empty where = targets ALL records
});
// Error: [_update] Entity: User | DENY to perform update | Empty where condition
// (updateBy is an alias that delegates to updateAll)

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

**Problem:** The repository cannot find its table in the DataSource schema.

**Error Message:**
```
[UserRepository] Schema key mismatch | Entity name 'User' not found in connector.query | Available keys: [users, Post] | Ensure the model's TABLE_NAME matches the schema registration key
```

**Cause:** Two keys are resolved by *different* rules:

| Key | Rule |
|-----|------|
| Schema registration key | `@model({ tableName })` > `static TABLE_NAME` > class name |
| Repository lookup key (`entity.name`) | `static TABLE_NAME` > class name |

`@model({ tableName })` moves the registration key but not the lookup key. Setting it alone is what breaks:

```typescript
export const userTable = pgTable('users', { /* ... */ });

// ❌ BAD - registered under 'user_accounts', looked up as 'users'
@model({ tableName: 'user_accounts' })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

// ✅ GOOD - set no `tableName`; both keys are the table's name, 'users'
@model()
export class User extends ModelFactory.defineEntity({ table: userTable }) {}
```

`ModelFactory.defineEntity` reads `TABLE_NAME` off the table, so it already moves both keys together. Leave `tableName` out of `@model`.

## 8. Validation Error Response Structure

**Problem:** Client receives validation errors but doesn't know how to parse them.

**Solution:** Understand the Zod validation error response format:

```json
{
  "statusCode": 422,
  "message": "Invalid email address",
  "normalized": {
    "text": "Invalid email address",
    "code": "invalid_format",
    "args": {}
  },
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "cause": [
      {
        "path": "email",
        "message": "Invalid email address",
        "code": "invalid_format"
      },
      {
        "path": "age",
        "message": "Invalid input: expected number, received string",
        "code": "invalid_type",
        "expected": "number"
      }
    ]
  }
}
```

- `normalized.code` comes from the first issue carrying a `params.code`, otherwise the first issue's raw Zod code. Attach a stable code clients can branch on with `.refine()`:
  ```typescript
  z.number().refine(isTwoDecimals, {
    message: 'At most 2 decimal places',
    params: { code: 'app.price.too_many_places' },
  });
  ```
- `args` is always `{}` here - per-field detail lives in `details.cause`.
- `details.stack` is omitted in production; `details.cause` is not.

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

**Cause:** Two models reference each other's schema. With a cycle, one module is still mid-evaluation when the other reads its exports, so `User.schema` is `undefined`.

**Solution:** `relations` accepts a resolver function. Use it - the framework calls it in `buildSchema()`, after every model has finished loading:

```typescript
import { User } from './user.model';

// ❌ BAD - array literal is evaluated at module load, while the cycle is still open
@model()
export class Order extends BaseRelationalEntity<typeof Order.schema> {
  static override relations: TRelationConfig[] = [
    { name: 'owner', type: RelationTypes.ONE, schema: User.schema, metadata: { ... } },
  ];
}

// ✅ GOOD - resolver defers the User.schema read until after both modules finish loading
@model()
export class Order extends BaseRelationalEntity<typeof Order.schema> {
  static override relations = (): TRelationConfig[] => [
    { name: 'owner', type: RelationTypes.ONE, schema: User.schema, metadata: { ... } },
  ];
}
```

**Alternative:** Restructure so both models import their shared pieces from a third module.

## 10. Transaction Not Rolling Back

**Problem:** Errors occur but database changes are still persisted.

**Cause:** Transaction not properly wrapped in try-catch, or rollback not called on error.

**Solution:** Always wrap transactions in try-catch with explicit rollback:

```typescript
// ❌ BAD - No error handling
const tx = await userRepository.beginTransaction();
await userRepository.create({ data, options: { transaction: tx } });
await tx.commit(); // If create fails, commit is never called but neither is rollback

// ✅ GOOD - Proper transaction handling
const tx = await userRepository.beginTransaction();
try {
  await userRepository.create({ data, options: { transaction: tx } });
  await orderRepository.updateById({ id, data: other, options: { transaction: tx } });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error; // Re-throw to let caller handle
}
```

This exact shape is safe even when `commit()` is what failed: a rollback on an already-torn-down transaction is a no-op, so it never replaces your original error. A failed `COMMIT` always throws - never treat a resolved `commit()` as anything but success.

## 11. Fire-and-Forget Promises Losing Context

**Problem:** `getCurrentUserId()` or other context-dependent functions return `null` in background tasks.

**Cause:** When you fire-and-forget a promise, it runs outside the original async context where the user was authenticated.

**Solution:** Pass required context data explicitly to background tasks:

```typescript
// ❌ BAD - Context lost in fire-and-forget
@post({ configs: RouteConfigs.CREATE_ORDER })
async createOrder(context: TRouteContext) {
  const data = context.req.valid<TCreateOrder>('json');
  const order = await this.orderService.create(data);

  // Fire-and-forget: sendNotification runs outside request context
  this.notificationService.sendOrderConfirmation(order.id);
  // Inside sendOrderConfirmation, getCurrentUserId() returns null!

  return context.json(order, HTTP.ResultCodes.RS_2.Created);
}

// ✅ GOOD - Pass user ID explicitly
@post({ configs: RouteConfigs.CREATE_ORDER })
async createOrder(context: TRouteContext) {
  const data = context.req.valid<TCreateOrder>('json');
  const userId = context.get(Authentication.AUDIT_USER_ID);
  const order = await this.orderService.create(data);

  // Pass userId explicitly to background task
  this.notificationService.sendOrderConfirmation(order.id, userId);

  return context.json(order, HTTP.ResultCodes.RS_2.Created);
}
```

> [!WARNING]
> This is especially important when using `allowAnonymous: false` in user audit columns. The enricher will throw an error if it cannot find the user context.

## 12. Incorrect Relation Configuration

**Problem:** Relations return empty arrays or `null` unexpectedly.

**Cause:** Mismatch between `fields` and `references` in relation metadata (or defining them on the wrong side).

**Solution:** `fields`/`references` belong on the `RelationTypes.ONE` side (the entity holding the foreign key). The `RelationTypes.MANY` side only takes a `relationName` pointing at the matching `one` relation:

```typescript
// ❌ BAD - fields and references swapped on the ONE side (on Post)
static override relations = (): TRelationConfig[] => [
  {
    name: 'author',
    type: RelationTypes.ONE,
    schema: User.schema,
    metadata: {
      fields: [User.schema.id],           // Wrong! This should be Post.schema.authorId
      references: [Post.schema.authorId], // Wrong! This should be User.schema.id
    },
  },
];

// ✅ GOOD - Correct configuration
// On Post: "Post belongs to one User where Post.authorId = User.id"
static override relations = (): TRelationConfig[] => [
  {
    name: 'author',
    type: RelationTypes.ONE,
    schema: User.schema,
    metadata: {
      fields: [Post.schema.authorId],  // Current entity's foreign key
      references: [User.schema.id],    // Related entity's key
    },
  },
];

// On User: "User has many Posts" - MANY side references the one relation by name
static override relations = (): TRelationConfig[] => [
  {
    name: 'posts',
    type: RelationTypes.MANY,
    schema: Post.schema,
    metadata: {
      relationName: 'author', // Points to the 'one' relation name on Post
    },
  },
];
```

**Rule of thumb:** on the `ONE` side, `fields` is the foreign key on the current entity, `references` is the key on the related entity. The `MANY` side only names its inverse relation.

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