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

// ❌ BAD - typo in string
@inject({ key: 'repositories.ConfigurationRepositry' })
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

**Pitfall:** When using the decorator-based routing with a shared `RouteConfigs` object, you forget to add `as const` to the object definition. TypeScript will infer the types too broadly, and you will lose the benefits of type-safe contexts (`TRouteContext`).

**Solution:** Always use `as const` when exporting a shared route configuration object.

**Example (`src/controllers/test/definitions.ts`):**
```typescript
export const RouteConfigs = {
  GET_USERS: { /* ... */ },
  GET_USER_BY_ID: { /* ... */ },
} as const; // <-- This is crucial!
```
This ensures that `TRouteContext<typeof RouteConfigs.GET_USERS>` has the precise types for request body, params, and response.

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