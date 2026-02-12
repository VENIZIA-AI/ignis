# Authentication -- Usage & Examples

> Securing routes, authentication flows, entity helpers, and API endpoint specifications. See [Setup & Configuration](./) for initial setup.

## Securing Routes

Use `authStrategies` and `authMode` in route configurations:

```typescript
// Single strategy
const SECURE_ROUTE_CONFIG = {
  path: '/secure-data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: jsonResponse({
    description: 'Protected data',
    schema: z.object({ message: z.string() }),
  }),
} as const;

// Multiple strategies with fallback (any mode)
const FALLBACK_AUTH_CONFIG = {
  path: '/api/data',
  method: HTTP.Methods.GET,
  authStrategies: [Authentication.STRATEGY_JWT, Authentication.STRATEGY_BASIC],
  authMode: 'any',
  responses: jsonResponse({
    description: 'Data accessible via JWT or Basic auth',
    schema: z.object({ data: z.any() }),
  }),
} as const;

// Skip authentication
const PUBLIC_ROUTE_CONFIG = {
  path: '/public',
  method: HTTP.Methods.GET,
  skipAuth: true,
  responses: jsonResponse({
    description: 'Public endpoint',
    schema: z.object({ message: z.string() }),
  }),
} as const;
```

## Using the `authenticate()` Standalone Function

The `authenticate()` function is a convenience wrapper around `AuthenticationStrategyRegistry.getInstance().authenticate()`. It returns a Hono `MiddlewareHandler` suitable for direct middleware usage:

```typescript
import { authenticate, Authentication } from '@venizia/ignis';

// Use as Hono middleware directly
const authMiddleware = authenticate({
  strategies: [Authentication.STRATEGY_JWT],
  mode: 'any',
});

// Apply to a Hono route
app.get('/protected', authMiddleware, (c) => {
  const user = c.get(Authentication.CURRENT_USER);
  return c.json({ userId: user.userId });
});
```

## Accessing the Current User

After authentication, the user payload is available on the Hono `Context`:

```typescript
import { Context } from 'hono';
import { Authentication, IJWTTokenPayload } from '@venizia/ignis';

// Inside a route handler
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload | undefined;

if (user) {
  console.log('Authenticated user ID:', user.userId);
  console.log('User roles:', user.roles);
}
```

## Dynamic Skip Authentication

Use `Authentication.SKIP_AUTHENTICATION` to dynamically skip auth in middleware:

```typescript
import { Authentication } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

const conditionalAuthMiddleware = createMiddleware(async (c, next) => {
  if (c.req.header('X-API-Key') === 'valid-api-key') {
    c.set(Authentication.SKIP_AUTHENTICATION, true);
  }
  return next();
});
```

## Implementing an AuthenticationService

The `AuthenticateComponent` depends on a service implementing the `IAuthService` interface when using the built-in auth controller:

```typescript
import {
  BaseService,
  inject,
  IAuthService,
  IJWTTokenPayload,
  JWTTokenService,
  TSignInRequest,
  getError,
} from '@venizia/ignis';
import { Context } from 'hono';

export class AuthenticationService extends BaseService implements IAuthService {
  constructor(
    @inject({ key: 'services.JWTTokenService' })
    private _jwtTokenService: JWTTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signIn(context: Context, opts: TSignInRequest): Promise<{ token: string }> {
    const { identifier, credential } = opts;
    const user = await this.userRepo.findByIdentifier(identifier);

    if (!user || !await this.verifyCredential(credential, user)) {
      throw getError({ message: 'Invalid credentials' });
    }

    const payload: IJWTTokenPayload = {
      userId: user.id,
      roles: user.roles,
    };

    const token = await this._jwtTokenService.generate({ payload });
    return { token };
  }

  async signUp(context: Context, opts: any): Promise<any> {
    // Implement your sign-up logic
  }

  async changePassword(context: Context, opts: any): Promise<any> {
    // Implement your change password logic
  }
}
```

## Entity Column Helpers

The authentication module provides a set of **column helper functions** designed to be spread into Drizzle `pgTable()` definitions. These functions return pre-configured column objects for common auth-related entities, saving you from manually defining columns for users, roles, permissions, and their relationships.

### Pattern

Each helper function returns an object of Drizzle column builders that you spread into your `pgTable()` call alongside any custom columns:

```typescript
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import {
  extraUserColumns,
  extraRoleColumns,
  extraPermissionColumns,
  extraPermissionMappingColumns,
  extraUserRoleColumns,
} from '@venizia/ignis';
import { withSerialId, withTimestamps } from '@venizia/ignis';

// User table with auth columns
export const users = pgTable('users', {
  ...withSerialId(),
  ...withTimestamps(),
  ...extraUserColumns(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  email: text('email').unique(),
});

// Role table with auth columns
export const roles = pgTable('roles', {
  ...withSerialId(),
  ...withTimestamps(),
  ...extraRoleColumns(),
});

// Permission table
export const permissions = pgTable('permissions', {
  ...withSerialId(),
  ...withTimestamps(),
  ...extraPermissionColumns(),
});

// Permission mapping (role-to-permission or user-to-permission)
export const permissionMappings = pgTable('permission_mappings', {
  ...withSerialId(),
  ...extraPermissionMappingColumns(),
});

// User-role junction table
export const userRoles = pgTable('user_roles', {
  ...withSerialId(),
  ...extraUserRoleColumns(),
});
```

### extraUserColumns

Returns columns for user-related fields with status and type defaults from `UserStatuses` and `UserTypes`.

```typescript
extraUserColumns(opts?: { idType: 'string' | 'number' })
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `realm` | `text` | `''` | Multi-tenancy realm identifier |
| `status` | `text` | `UserStatuses.UNKNOWN` (`'000_UNKNOWN'`) | User status |
| `type` | `text` | `UserTypes.SYSTEM` (`'SYSTEM'`) | User type |
| `activatedAt` | `timestamp (tz)` | `null` | Activation timestamp |
| `lastLoginAt` | `timestamp (tz)` | `null` | Last login timestamp |
| `parentId` | `text` or `integer` | `null` | Parent user ID (type depends on `idType`) |

### extraRoleColumns

Returns columns for role definitions. No options parameter.

```typescript
extraRoleColumns()
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `text` | -- | Unique role identifier (e.g., `'admin'`, `'user'`) |
| `name` | `text` | -- | Human-readable role name |
| `description` | `text` | `null` | Optional role description |
| `priority` | `integer` | -- | Role priority (lower = higher priority) |
| `status` | `text` | `RoleStatuses.ACTIVATED` (`'201_ACTIVATED'`) | Role status |

### extraPermissionColumns

Returns columns for permission definitions. Supports `idType` option for the `parentId` column type.

```typescript
extraPermissionColumns(opts?: { idType: 'string' | 'number' })
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `code` | `text` | -- | Unique permission code |
| `name` | `text` | -- | Permission name |
| `subject` | `text` | -- | Permission subject (e.g., `'User'`, `'Order'`) |
| `pType` | `text` | -- | Permission type (maps to DB column `p_type`) |
| `action` | `text` | -- | Permitted action (e.g., `'read'`, `'write'`) |
| `scope` | `text` | -- | Permission scope |
| `parentId` | `text` or `integer` | `null` | Parent permission ID |

### extraPermissionMappingColumns

Returns columns for mapping permissions to users or roles.

```typescript
extraPermissionMappingColumns(opts?: { idType: 'string' | 'number' })
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `effect` | `text` | `null` | Permission effect (e.g., `'allow'`, `'deny'`) |
| `userId` | `text` or `integer` | `null` | Associated user ID |
| `roleId` | `text` or `integer` | `null` | Associated role ID |
| `permissionId` | `text` or `integer` | -- | Associated permission ID (not null) |

### extraUserRoleColumns

Returns columns for the user-role junction table. Includes principal columns (polymorphic type/ID fields) via `generatePrincipalColumnDefs` with a default polymorphic value of `'Role'`.

```typescript
extraUserRoleColumns(opts?: { idType: 'string' | 'number' })
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| _(principal columns)_ | _various_ | -- | Polymorphic columns from `generatePrincipalColumnDefs` |
| `userId` | `text` or `integer` | -- | Associated user ID (not null) |

### ID Type Polymorphism

All column helpers that accept `opts.idType` default to `'number'` (producing `integer` columns). Pass `'string'` to use `text` columns instead:

```typescript
// Number IDs (default) -- uses integer columns for FK references
extraUserColumns()
extraPermissionColumns()

// String IDs (e.g., UUID) -- uses text columns for FK references
extraUserColumns({ idType: 'string' })
extraPermissionColumns({ idType: 'string' })
```

## Status Constants

The authentication module uses status classes from `@/common/statuses`. These extend `CommonStatuses` and provide lifecycle state management for auth entities.

### UserStatuses

Inherits all statuses from `CommonStatuses`:

| Constant | Value | Description |
|----------|-------|-------------|
| `UserStatuses.UNKNOWN` | `'000_UNKNOWN'` | Initial/unverified state |
| `UserStatuses.ACTIVATED` | `'201_ACTIVATED'` | Active user |
| `UserStatuses.DEACTIVATED` | `'401_DEACTIVATED'` | Deactivated user |
| `UserStatuses.BLOCKED` | `'403_BLOCKED'` | Blocked user |
| `UserStatuses.ARCHIVED` | `'405_ARCHIVED'` | Archived user |

### UserTypes

| Constant | Value | Description |
|----------|-------|-------------|
| `UserTypes.SYSTEM` | `'SYSTEM'` | System-created user (default) |
| `UserTypes.LINKED` | `'LINKED'` | Linked/external user |

### RoleStatuses

Inherits all statuses from `CommonStatuses` (same values as `UserStatuses`):

| Constant | Value | Description |
|----------|-------|-------------|
| `RoleStatuses.UNKNOWN` | `'000_UNKNOWN'` | Initial state |
| `RoleStatuses.ACTIVATED` | `'201_ACTIVATED'` | Active role (default for `extraRoleColumns`) |
| `RoleStatuses.DEACTIVATED` | `'401_DEACTIVATED'` | Deactivated role |
| `RoleStatuses.BLOCKED` | `'403_BLOCKED'` | Blocked role |
| `RoleStatuses.ARCHIVED` | `'405_ARCHIVED'` | Archived role |

## Auth Flows

### JWT Authentication Flow

1. **Client sends request** with <code v-pre>Authorization: Bearer &lt;token&gt;</code> header
2. **JWTAuthenticationStrategy.authenticate()** is called by the Hono middleware
3. **JWTTokenService.extractCredentials()** extracts the token from the Authorization header
4. **JWTTokenService.verify()** verifies the JWT signature using `jose.jwtVerify()`
5. **JWTTokenService.decryptPayload()** decrypts the AES-encrypted payload fields
6. **User payload is set** on `context.get(Authentication.CURRENT_USER)`

> [!NOTE]
> JWT payloads are encrypted field-by-field for additional security. Standard JWT fields (`iss`, `sub`, `aud`, etc.) remain unencrypted, while custom fields like `userId` and `roles` are AES-encrypted.

### Basic Authentication Flow

1. **Client sends request** with <code v-pre>Authorization: Basic &lt;base64(username:password)&gt;</code> header
2. **BasicAuthenticationStrategy.authenticate()** is called by the Hono middleware
3. **BasicTokenService.extractCredentials()** decodes the Base64 credentials
4. **BasicTokenService.verify()** calls the user-provided `verifyCredentials` callback
5. **User payload is set** on `context.get(Authentication.CURRENT_USER)` if verification succeeds

> [!IMPORTANT]
> The `verifyCredentials` callback must perform all necessary validation (password hashing comparison, user lookup, etc.) and return an `IAuthUser` object or `null`.

## Multi-Strategy Authentication

When multiple strategies are configured on a route via `authStrategies: ['jwt', 'basic']`:

**`any` mode (default):**
- Strategies are tried in the order specified
- The first successful strategy wins
- If all strategies fail, a `401 Unauthorized` error is thrown listing all tried strategies
- **Use case:** Fallback authentication (try JWT, fallback to Basic)

**`all` mode:**
- Every strategy must pass successfully
- If any strategy fails, the request is immediately rejected (exception propagates)
- The last strategy's user payload is used
- **Use case:** Multi-factor authentication (both JWT and Basic required)

> [!TIP]
> Use `'any'` mode for graceful fallback (e.g., allow mobile apps to use JWT while legacy systems use Basic). Use `'all'` mode for high-security endpoints requiring multiple forms of authentication.

## Token Encryption

JWT payloads are encrypted field-by-field using AES (default `aes-256-cbc`) via the `@venizia/ignis-helpers` AES utility:

**Encryption process:**
1. Standard JWT fields (`iss`, `sub`, `aud`, `jti`, `nbf`, `exp`, `iat`) are preserved as-is
2. All other fields have both their **keys** and **values** AES-encrypted
3. The `roles` field is serialized as `id|identifier|priority` pipe-separated strings before encryption
4. `null` and `undefined` values are skipped during encryption

**Encryption code walkthrough:**

The `encryptPayload()` method processes each field:
1. Standard JWT fields (`iss`, `sub`, `aud`, `jti`, `nbf`, `exp`, `iat`) are copied as-is
2. `null`/`undefined` values are skipped entirely
3. For the `roles` field: values are serialized as `"id|identifier|priority"` pipe-separated strings, then the array is JSON-stringified before encryption
4. For all other fields: values are converted to string via template literal (<code v-pre>`${value}`</code>), then both key and value are AES-encrypted independently
5. The encrypted key becomes the new field name, the encrypted value becomes its value

**Decryption process:**
1. Standard JWT fields are extracted directly
2. Encrypted fields have their keys decrypted first, then their values
3. The `roles` field is deserialized: JSON-parsed to a string array, then each entry is split on `|` to reconstruct objects with `id`, `identifier`, and `priority` (where `priority` is converted to integer via `int()`)

> [!WARNING]
> The `applicationSecret` must remain constant across all instances of your application. Changing it will invalidate all existing tokens, as they cannot be decrypted with a different secret.

## Hono Context Extension

The Authentication module extends Hono's `ContextVariableMap` to provide type-safe access to auth data:

```typescript
declare module 'hono' {
  interface ContextVariableMap<User extends IAuthUser = IAuthUser> {
    [Authentication.CURRENT_USER]: User;
    [Authentication.AUDIT_USER_ID]: IdType;
  }
}
```

This enables type-safe access in route handlers:

```typescript
// TypeScript knows this is IAuthUser
const user = c.get(Authentication.CURRENT_USER);
```

**Context variable keys (from `Authentication` constants):**

| Key | Constant | Type | Description |
|-----|----------|------|-------------|
| `'auth.current.user'` | `Authentication.CURRENT_USER` | `IAuthUser` | The authenticated user payload |
| `'audit.user.id'` | `Authentication.AUDIT_USER_ID` | `IdType` | The authenticated user's ID (extracted from `userId`) |
| `'authentication.skip'` | `Authentication.SKIP_AUTHENTICATION` | `boolean` | Set to `true` to bypass authentication on a request |

## Request Schemas

### SignInRequestSchema

The built-in schema uses a nested `identifier` + `credential` structure:

```typescript
const SignInRequestSchema = z.object({
  identifier: z.object({
    scheme: requiredString({ min: 4 }),  // e.g., 'username', 'email'
    value: requiredString({ min: 8 }),   // the actual identifier value
  }),
  credential: z.object({
    scheme: requiredString(),             // e.g., 'basic', 'password'
    value: requiredString({ min: 8 }),   // the actual credential value
  }),
  clientId: z.string().optional(),        // optional auth provider
});

type TSignInRequest = z.infer<typeof SignInRequestSchema>;
```

| Field | Type | Constraints |
|-------|------|-------------|
| `identifier.scheme` | `string` | Non-empty, min 4 chars |
| `identifier.value` | `string` | Non-empty, min 8 chars |
| `credential.scheme` | `string` | Non-empty |
| `credential.value` | `string` | Non-empty, min 8 chars |
| `clientId` | `string` | Optional |

**OpenAPI examples** (from source):
```json
[
  {
    "identifier": { "scheme": "username", "value": "test_username" },
    "credential": { "scheme": "basic", "value": "test_password" }
  },
  {
    "identifier": { "scheme": "username", "value": "test_username" },
    "credential": { "scheme": "basic", "value": "test_password" },
    "clientId": "auth-provider"
  }
]
```

### SignUpRequestSchema

The built-in schema uses a **flat structure** -- not the nested `identifier`/`credential` pattern used by sign-in:

```typescript
const SignUpRequestSchema = z.object({
  username: z.string().nonempty().min(8),
  credential: z.string().nonempty().min(8),
});

type TSignUpRequest = z.infer<typeof SignUpRequestSchema>;
```

| Field | Type | Constraints |
|-------|------|-------------|
| `username` | `string` | Non-empty, min 8 chars |
| `credential` | `string` | Non-empty, min 8 chars |

**OpenAPI examples** (from source):
```json
[
  {
    "username": "example_username",
    "credential": "example_credential"
  }
]
```

### ChangePasswordRequestSchema

The built-in schema uses scheme-based credential naming with a `userId` field:

```typescript
const ChangePasswordRequestSchema = z.object({
  scheme: z.string(),
  oldCredential: requiredString({ min: 8 }),
  newCredential: requiredString({ min: 8 }),
  userId: z.string().or(z.number()),
});

type TChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
```

| Field | Type | Constraints |
|-------|------|-------------|
| `scheme` | `string` | Required (e.g., `'basic'`) |
| `oldCredential` | `string` | Non-empty, min 8 chars |
| `newCredential` | `string` | Non-empty, min 8 chars |
| `userId` | `string \| number` | Required |

**OpenAPI examples** (from source):
```json
[
  {
    "scheme": "basic",
    "oldCredential": "old_password",
    "newCredential": "new_password"
  }
]
```

### JWTTokenPayloadSchema

Exported from the controller factory module. Used as the response schema for the `/who-am-i` endpoint:

```typescript
const JWTTokenPayloadSchema = z.object({
  userId: z.string().or(z.number()),
  roles: z.array(
    z.object({
      id: z.string().or(z.number()),
      identifier: z.string(),
      priority: z.number().int(),
    }),
  ),
  clientId: z.string().optional(),
  provider: z.string().optional(),
  email: z.email().optional(),
});
```

### Custom Schema Example

```typescript
import { z } from 'zod';

this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: {
    restPath: '/auth',
    payload: {
      signIn: {
        request: {
          schema: z.object({
            email: z.string().email(),
            password: z.string().min(8),
          }),
        },
        response: {
          schema: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number(),
          }),
        },
      },
    },
  },
});
```

## API Endpoints

The built-in auth controller is created by the `defineAuthController()` factory function and is only available when `useAuthController: true` is set in `REST_OPTIONS`.

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| `POST` | `/auth/sign-in` | No | Authenticate and receive a JWT token |
| `POST` | `/auth/sign-up` | Configurable | Create a new user account |
| `POST` | `/auth/change-password` | JWT | Change the authenticated user's password |
| `GET` | `/auth/who-am-i` | JWT | Return the current user's JWT payload |

> [!NOTE]
> The base path `/auth` is configurable via `controllerOpts.restPath`. All paths shown above use the default.

### POST /auth/sign-in

**Authentication:** None

**Request Body:**

Uses `SignInRequestSchema` by default, or a custom schema via `payload.signIn.request.schema`.

Default schema:
```typescript
{
  identifier: {
    scheme: string;  // min 4 chars, e.g., 'username', 'email'
    value: string;   // min 8 chars
  };
  credential: {
    scheme: string;  // e.g., 'basic', 'password'
    value: string;   // min 8 chars
  };
  clientId?: string;
}
```

**Response 200:**

Uses `payload.signIn.response.schema` if provided, otherwise `AnyObjectSchema`.

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Example:**
```typescript
const response = await fetch('/auth/sign-in', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifier: { scheme: 'email', value: 'user@example.com' },
    credential: { scheme: 'password', value: 'my-password' },
  }),
});

const { token } = await response.json();
```


### POST /auth/sign-up

**Authentication:** Configurable via `requireAuthenticatedSignUp` (default: `false`)

When `requireAuthenticatedSignUp: true`, requires JWT authentication (strategy: `Authentication.STRATEGY_JWT`). When `false`, the `strategies` array is empty (public endpoint).

**Request Body:**

Uses `SignUpRequestSchema` by default, or a custom schema via `payload.signUp.request.schema`.

Default schema (flat structure):
```typescript
{
  username: string;   // non-empty, min 8 chars
  credential: string; // non-empty, min 8 chars
}
```

**Response 200:**

Uses `payload.signUp.response.schema` if provided, otherwise `AnyObjectSchema`.

```json
{
  "id": "user-id",
  "username": "newuser123"
}
```

**Example:**
```typescript
const response = await fetch('/auth/sign-up', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'newuser123',
    credential: 'secure-password',
  }),
});

const user = await response.json();
```


### POST /auth/change-password

**Authentication:** Always requires JWT (`Authentication.STRATEGY_JWT`)

**Request Body:**

Uses `ChangePasswordRequestSchema` by default, or a custom schema via `payload.changePassword.request.schema`.

Default schema:
```typescript
{
  scheme: string;        // e.g., 'basic'
  oldCredential: string; // non-empty, min 8 chars
  newCredential: string; // non-empty, min 8 chars
  userId: string | number;
}
```

**Response 200:**

Uses `payload.changePassword.response.schema` if provided, otherwise `AnyObjectSchema`.

```json
{
  "success": true
}
```

**Example:**
```typescript
const response = await fetch('/auth/change-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    scheme: 'basic',
    oldCredential: 'old-password',
    newCredential: 'new-secure-password',
    userId: '123',
  }),
});

const result = await response.json();
```


### GET /auth/who-am-i

**Authentication:** Always requires JWT (`Authentication.STRATEGY_JWT`)

**Request Body:** None

**Response 200:**

Uses the `JWTTokenPayloadSchema` Zod schema. Returns the current user's decrypted JWT payload directly from context:

```json
{
  "userId": "123",
  "roles": [
    { "id": "1", "identifier": "admin", "priority": 0 }
  ],
  "clientId": "optional-client-id",
  "provider": "optional-provider",
  "email": "user@example.com"
}
```

**Example:**
```typescript
const response = await fetch('/auth/who-am-i', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

const user = await response.json();
console.log('Current user:', user);
```

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [API Reference](./api) -- Architecture, service internals, and strategy registry
- [Error Reference](./errors) -- Error messages and troubleshooting
