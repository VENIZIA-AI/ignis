# Error

Standardized error class and factory for throwing HTTP-aware errors with machine-readable codes across the application.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `ApplicationError` |
| **Extends** | `Error` (native) |
| **Runtimes** | Both |

#### Import Paths

```typescript
import { ApplicationError, getError, isApplicationError } from '@venizia/ignis-helpers';
import { ErrorSchema } from '@venizia/ignis-helpers';
import type { TError } from '@venizia/ignis-helpers';
```

## Creating an Instance

The canonical way to raise an error in IGNIS is the standalone `getError()` factory - use it everywhere (house rule: `getError`, never `new Error`). `ApplicationError` extends the native `Error` class with an HTTP `statusCode` and an optional `messageCode` for machine-readable error identification; `getError()` constructs one for you.

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

throw getError({
  message: 'User not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  messageCode: 'core.user.not_found',
});
```

#### Options (`TError`)

The same options apply to `getError()`, the `ApplicationError` constructor, and the static factory:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | -- (required) | Human-readable error message |
| `statusCode` | `number` | `400` | HTTP status code |
| `messageCode` | `string` | `MessageCode.DEFAULT` (`'core.system_error'`) | Machine-readable error code for client-side handling. Always resolved through `MessageCode.resolve()` -- never left `undefined`, and lower-cased regardless of what was passed in |
| `name` | `string` | `undefined` | Accepted by the schema but discarded by the constructor (the native `Error` name is kept) |

> [!TIP]
> The `TError` type is derived from `ErrorSchema` (a Zod schema) and uses `.catchall(z.any())`, so you can pass additional arbitrary properties beyond the four listed above. Extra properties are collected into the `extra` field on the resulting `ApplicationError` instance.

#### `ApplicationError` Constructor and Static Factory

`getError()` is the canonical form. The class constructor and the static `ApplicationError.getError()` are legal equivalents - use them only when a direct class reference reads better:

```typescript
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';

// Class constructor (equivalent to getError)
const error = new ApplicationError({
  message: 'Configuration missing',
  statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
});

// Static factory (equivalent to getError)
throw ApplicationError.getError({
  message: 'Invalid credentials',
  statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
  messageCode: 'core.auth.invalid_credentials',
});
```

### MessageCode

`MessageCode` builds and normalizes the machine-readable codes carried on `ApplicationError.messageCode`. Every code an application throws should be constructed with `MessageCode.build()` rather than typed as a raw string literal -- a malformed code fails at module load (import time) instead of shipping dead into production.

```typescript
import { MessageCode } from '@venizia/ignis-helpers';

export class UserErrorCodes {
  static readonly NOT_FOUND = MessageCode.build({ parts: ['core', 'user', 'not_found'] });
  static readonly DUPLICATE_EMAIL = MessageCode.build({ parts: ['core', 'user', 'duplicate_email'] });
}
```

| Member | Type | Value / Signature | Description |
|--------|------|--------------------|-------------|
| `DEFAULT` | `string` | `'core.system_error'` | The code `ApplicationError` falls back to when no `messageCode` is supplied |
| `SEPARATOR` | `string` | `'.'` | Joins segments into a dotted code (e.g. `core.mail.send_failed`) |
| `SEGMENT_PATTERN` | `RegExp` | `/^[a-z0-9]+(_[a-z0-9]+)*$/` | Each segment must be lower snake_case -- `a-z`, `0-9`, `_` |
| `MIN_SEGMENTS` | `number` | `2` | A code needs at least a namespace and a reason (e.g. `core.not_found` is valid, `not_found` alone is not) |
| `build(opts: { parts: Array<string> })` | `string` | -- | Joins `parts` with `SEPARATOR` and lower-cases the result. Throws (via `getError`) if `parts.length < MIN_SEGMENTS`, or if any segment fails `SEGMENT_PATTERN` |
| `isValid(code: string)` | `boolean` | -- | Cheap structural check for a code arriving from outside the process |
| `resolve(code?: string)` | `string` | -- | Normalizes an absent or empty code to `DEFAULT`; otherwise lower-cases `code` |

> [!IMPORTANT]
> `ApplicationError`'s constructor always calls `MessageCode.resolve(messageCode)` -- so `error.messageCode` is **never** `undefined`, and it is **always lower-cased** regardless of the casing passed to `getError()`. A comparison like `error.messageCode === 'DUPLICATE_EMAIL'` is always false; compare against `'duplicate_email'` (or the exact string returned by `MessageCode.build()`).

## Checking for an Application Error

Use `isApplicationError(error)` to recognize an application error by **shape** - an `Error` instance carrying a numeric `statusCode` - rather than by class identity:

```typescript
import { isApplicationError } from '@venizia/ignis-helpers';

try {
  await someOperation();
} catch (error) {
  if (isApplicationError(error)) {
    // already shaped (has a statusCode) - surface as-is
    throw error;
  }
  // an unknown failure - sanitize before rethrowing
  throw getError({ message: 'Operation failed', statusCode: HTTP.ResultCodes.RS_5.InternalServerError });
}
```

> [!WARNING]
> Never compare `ApplicationError` with `instanceof` across a package boundary. `inversion` ships **dual CJS + ESM** builds (its DI powers frontend libraries), so its error class deliberately has more than one runtime identity, and `helpers` keeps its own `ApplicationError` for the backend stack. Two objects that are both "an application error" can be instances of different classes, so `instanceof` gives false negatives. `isApplicationError` checks the shape and works regardless of which package threw. The search connectors use it to decide what is already shaped versus what must be sanitized as a `503`.

## Usage

### Throwing Errors in Services

The most common pattern is throwing `ApplicationError` from service methods to signal HTTP-level failures. The framework's error handling middleware catches these and formats the response automatically.

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

class AuthenticationService {
  async signUp(opts: { username: string; credential: string }) {
    const existingUser = await this.userRepository.findByUsername(opts.username);
    if (existingUser) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Username already exists',
      });
    }
    // ...
  }
}
```

### Using `messageCode` for Client-Side Handling

The `messageCode` field allows frontend applications to map errors to localized messages or specific UI behaviors without parsing the human-readable `message` string.

```typescript
throw getError({
  message: 'Email verification required before login',
  statusCode: HTTP.ResultCodes.RS_4.Forbidden,
  messageCode: 'auth.email_not_verified',
});
```

### Error Response Format

The built-in `appErrorHandler` middleware (from `@venizia/ignis`) catches `ApplicationError` instances and formats them into consistent JSON responses. The response shape differs by environment.

#### Sanitized (Production-Class) Response

The handler is **fail-closed**: it exposes internals only when `NODE_ENV` names a development environment - one of `local`, `debug`, `development`, `dev`, `sit` (`Environment.DEVELOPMENT_ENVS`). Everything else is sanitized as production: `production`, and also `alpha`, `beta`, `uat`, `staging`, an unrecognized name, and an unset `NODE_ENV`.

In a sanitized response, `stack` and `cause` are omitted from `details`. For unexpected errors without a `statusCode` (i.e., not thrown via `getError`), the raw message is replaced with a generic `"Internal Server Error"`, and a database error keeps only its base message - no SQL detail, no table or constraint name.

```json
{
  "message": "User not found",
  "messageCode": "core.user.not_found",
  "statusCode": 404,
  "requestId": "abc-123-def",
  "details": {
    "url": "http://localhost:3000/api/users/123",
    "path": "/api/users/123"
  }
}
```

#### Development Response

In a development environment (see the list above), `details` additionally includes debugging fields:

```json
{
  "message": "User not found",
  "messageCode": "core.user.not_found",
  "statusCode": 404,
  "requestId": "abc-123-def",
  "details": {
    "url": "http://localhost:3000/api/users/123",
    "path": "/api/users/123",
    "stack": "Error: User not found\n    at ...",
    "cause": "..."
  }
}
```

### ErrorSchema (Zod)

`ErrorSchema` is a Zod object schema used for OpenAPI response documentation. It is typically referenced in route definitions to describe error responses.

```typescript
import { ErrorSchema, HTTP } from '@venizia/ignis-helpers';

// In route definition responses
const responses = {
  [HTTP.ResultCodes.RS_4.NotFound]: {
    description: 'Resource not found',
    content: {
      'application/json': { schema: ErrorSchema },
    },
  },
};
```

The schema shape:

```typescript
const ErrorSchema = z
  .object({
    name: z.string().optional(),
    statusCode: z.number().optional(),
    messageCode: z.string().optional(),
    message: z.string(),
  })
  .catchall(z.any());
```

### Common Status Code Patterns

| Scenario | Status Code | `HTTP.ResultCodes` Path |
|----------|-------------|-------------------------|
| Invalid input / bad request | 400 | `RS_4.BadRequest` |
| Missing or invalid auth | 401 | `RS_4.Unauthorized` |
| Insufficient permissions | 403 | `RS_4.Forbidden` |
| Resource not found | 404 | `RS_4.NotFound` |
| Duplicate resource | 409 | `RS_4.Conflict` |
| Validation error | 422 | `RS_4.UnprocessableEntity` |
| Server failure | 500 | `RS_5.InternalServerError` |

## Troubleshooting

### `statusCode` defaults to 400

**Cause:** `getError()` was called without specifying a `statusCode`. The `ApplicationError` constructor defaults to `400` (Bad Request).

**Fix:** Always provide an explicit status code using `HTTP.ResultCodes`:

```typescript
throw getError({
  message: 'Resource not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
});
```

### Error response missing `stack` and `cause`

**Cause:** `NODE_ENV` is not one of the development environments, so the handler sanitized the response (`url` and `path` are always included). Note this is what happens on `alpha`/`staging`, on a typo'd name, and when `NODE_ENV` is unset - not only on `production`.

**Fix:** Set `NODE_ENV` to a development name - `development`, `dev`, `local`, `debug` or `sit`. Anything else stays sanitized by design.

### Errors returning 500 instead of expected status code

**Cause:** A plain `Error` (not `ApplicationError`) was thrown. The `appErrorHandler` middleware only reads `statusCode` from errors that have that property. Native `Error` instances default to `500`.

**Fix:** Use `getError()` or `new ApplicationError()` instead of `new Error()`:

```typescript
// Incorrect -- will return 500
throw new Error('Not found');

// Correct -- will return 404
throw getError({
  message: 'Not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
});
```

## See Also

- [Controllers](/references/base/controllers) -- Throwing errors in route handlers
- [Services](/references/base/services) -- Error handling in business logic
- [Middlewares](/references/base/middlewares) -- The `appErrorHandler` middleware
- [Helpers Index](/extensions/helpers/) -- All available helpers
- [Logger Helper](/extensions/helpers/logger/) -- Logging errors
