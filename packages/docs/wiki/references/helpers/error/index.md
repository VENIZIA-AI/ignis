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
import { ApplicationError, getError } from '@venizia/ignis-helpers';
import { ErrorSchema } from '@venizia/ignis-helpers';
import type { TError } from '@venizia/ignis-helpers';
```

> [!NOTE]
> `ApplicationError`, `getError`, `ErrorSchema`, and `TError` are also available from `@venizia/ignis-inversion` and re-exported through `@venizia/ignis`.

## Creating an Instance

`ApplicationError` extends the native `Error` class with an HTTP `statusCode` and an optional `messageCode` for machine-readable error identification.

```typescript
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';

const error = new ApplicationError({
  message: 'User not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  messageCode: 'USER_NOT_FOUND',
});
```

#### Constructor Options (`TError`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | -- (required) | Human-readable error message |
| `statusCode` | `number` | `400` | HTTP status code |
| `messageCode` | `string` | `undefined` | Machine-readable error code for client-side handling |
| `name` | `string` | `undefined` | Error name |

> [!TIP]
> The `TError` type is derived from `ErrorSchema` (a Zod schema) and uses `.catchall(z.any())`, so you can pass additional arbitrary properties beyond the four listed above.

#### `getError()` Factory Function

For convenience, use the standalone `getError()` function instead of calling `new ApplicationError()` directly. This is the preferred pattern throughout the Ignis codebase.

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

throw getError({
  message: 'Invalid credentials',
  statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
  messageCode: 'INVALID_CREDENTIALS',
});
```

#### `ApplicationError.getError()` Static Method

An equivalent static factory method on the class itself:

```typescript
throw ApplicationError.getError({
  message: 'Configuration missing',
  statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
});
```

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

#### Production Response

```json
{
  "message": "User not found",
  "statusCode": 404,
  "requestId": "abc-123-def"
}
```

#### Development Response

In development (`NODE_ENV=development`), additional debugging fields are included:

```json
{
  "message": "User not found",
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

**Cause:** The application is running in production mode. The `appErrorHandler` middleware strips `stack`, `cause`, `url`, and `path` from responses when `NODE_ENV` is not `development`.

**Fix:** Set `NODE_ENV=development` to see full error details during debugging.

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
- [Helpers Index](/references/helpers/) -- All available helpers
- [Logger Helper](/references/helpers/logger/) -- Logging errors
- [Error Handling Best Practices](/best-practices/error-handling) -- Patterns and anti-patterns
- [Common Pitfalls](/best-practices/common-pitfalls) -- Frequent error handling mistakes
