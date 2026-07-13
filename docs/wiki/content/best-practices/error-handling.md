# Error Handling

Comprehensive guide to handling errors gracefully in IGNIS applications.

## Error Handling Philosophy

| Principle | Description |
|-----------|-------------|
| **Fail Fast** | Detect and report errors as early as possible |
| **Don't Swallow** | Never catch errors without logging or re-throwing |
| **User-Friendly** | Return clear, actionable messages to clients |
| **Debuggable** | Include context for debugging in logs |

## 1. Using `getError` Helper

IGNIS provides `getError` for creating consistent, structured errors.

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

// Basic error
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  message: 'User not found',
});

// Error with details
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
  message: 'Invalid request',
  details: {
    field: 'email',
    reason: 'Must be a valid email address',
  },
});

// Error with context (for logging)
throw getError({
  statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
  message: '[UserService][create] Database connection failed',
  details: { userId: requestedId },
});
```

## 2. HTTP Status Code Reference

Use the correct status code for each error type:

| Code | Constant | Use When |
|------|----------|----------|
| 400 | `RS_4.BadRequest` | Invalid input format, missing required fields, database constraint violations (auto-handled) |
| 401 | `RS_4.Unauthorized` | Missing or invalid authentication |
| 403 | `RS_4.Forbidden` | Authenticated but insufficient permissions |
| 404 | `RS_4.NotFound` | Resource does not exist |
| 409 | `RS_4.Conflict` | Resource already exists (custom duplicate handling); transient DB conflicts (deadlock / serialization failure, auto-handled) |
| 422 | `RS_4.UnprocessableEntity` | Validation failed (Zod errors) |
| 429 | `RS_4.TooManyRequests` | Rate limit exceeded |
| 500 | `RS_5.InternalServerError` | Unexpected server error |
| 502 | `RS_5.BadGateway` | External service failed |
| 503 | `RS_5.ServiceUnavailable` | Service temporarily down |

:::tip Automatic Database Error Handling
Database errors in SQLSTATE classes `22` (data exception), `23` (integrity constraint - unique, foreign key, not null, check, exclusion), and `44` (WITH CHECK OPTION violation) are automatically converted to HTTP 400 by the global error middleware. Transient conflicts (`40001` serialization failure, `40P01` deadlock) become HTTP 409 with a retryable message. You don't need to catch these manually. Other classes (e.g. syntax / undefined column) stay 500, and production responses are sanitized - see [Repository Layer Errors](#repository-layer-errors).
:::

## 3. Error Handling Patterns

### Service Layer Errors

```typescript
import { BaseService } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

export class UserService extends BaseService {
  async createUser(data: TCreateUserRequest): Promise<TUser> {
    // Validate business rules (findOne returns the record or null)
    const existingUser = await this.userRepository.findOne({
      filter: { where: { email: data.email } },
    });

    if (existingUser) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Email already registered',
        details: { email: data.email },
      });
    }

    // Handle external service errors
    try {
      await this.emailService.sendWelcome(data.email);
    } catch (error) {
      // Log but don't fail user creation
      this.logger.error('[createUser] Failed to send welcome email | email: %s | error: %s',
        data.email, error.message);
    }

    // create returns { count, data }
    const created = await this.userRepository.create({ data });
    return created.data;
  }

  async getUserOrFail(id: string): Promise<TUser> {
    // findById returns the record or null (no wrapper object)
    const user = await this.userRepository.findById({ id });

    if (!user) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        message: 'User not found',
        details: { id },
      });
    }

    return user;
  }
}
```

### Controller Layer Errors

Controllers should delegate to services and let the global error handler catch exceptions:

```typescript
import { BaseRestController, controller, get, post } from '@venizia/ignis';

@controller({ path: '/users' })
export class UserController extends BaseRestController {

  @post({ configs: RouteConfigs.CREATE_USER })
  async createUser(c: TRouteContext) {
    const data = c.req.valid<{ name: string; email: string }>('json');

    // Service throws appropriate errors
    const user = await this.userService.createUser(data);

    return c.json(user, HTTP.ResultCodes.RS_2.Created);
  }

  @get({ configs: RouteConfigs.GET_USER })
  async getUser(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');

    // Service throws 404 if not found
    const user = await this.userService.getUserOrFail(id);

    return c.json(user, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### Repository Layer Errors

Database errors in SQLSTATE classes `22` (data exception), `23` (integrity constraint - unique, foreign key, not null, check, exclusion), and `44` (WITH CHECK OPTION violation) are **automatically handled** by the global error middleware and return HTTP 400. Transient conflicts (`40001` serialization failure, `40P01` deadlock) return HTTP 409 with a generic retryable message. Codes outside those classes (e.g. class `42` undefined column - an application/SQL bug) correctly stay 500.

**Non-production** returns the full driver context for debugging:

```json
{
  "message": "Unique constraint violation\nDetail: Key (email)=(test@example.com) already exists.\nTable: User\nConstraint: UQ_User_email",
  "messageCode": "core.system_error",
  "statusCode": 400,
  "requestId": "abc123"
}
```

:::warning Production sanitizes database internals
In production the message is the **base message only** - `Detail:` (which echoes row values like emails), `Table:`, and `Constraint:` are stripped, and `details.stack`/`details.cause` are omitted. Unexpected (non-client) database errors and connection failures return a generic `"Internal Server Error"`, so SQL, schema names, and connection host/port never leak. Use `requestId` + server logs to diagnose.

```json
{ "message": "Unique constraint violation", "messageCode": "core.system_error", "statusCode": 400, "requestId": "abc123" }
```
:::

You don't need to wrap repository calls in try-catch for constraint errors. If you need custom error messages, you can still handle them explicitly:

```typescript
import { DefaultCRUDRepository } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  async createWithCustomError(data: TCreateUser): Promise<TCreateResult<TUser>> {
    try {
      return await this.create({ data });
    } catch (error) {
      // Custom message for specific constraint
      if (error.cause?.code === '23505' && error.cause?.constraint === 'UQ_User_email') {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.Conflict,
          message: 'This email is already registered. Please use a different email or login.',
        });
      }
      throw error; // Re-throw for automatic handling
    }
  }
}
```

## 4. Global Error Handler

IGNIS includes a built-in error handler. Customize behavior in your application:

```typescript
import { BaseApplication } from '@venizia/ignis';
import { ApplicationError, MessageCode } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override setupMiddlewares(): void {
    super.setupMiddlewares();

    // Custom error handler (optional)
    this.server.onError((error, c) => {
      const requestId = c.get('requestId') ?? 'unknown';

      // Log all errors
      this.logger.error('[%s] Error | %s', requestId, error.message);

      // Handle known application errors
      if (error instanceof ApplicationError) {
        return c.json({
          statusCode: error.statusCode,
          message: error.message,
          messageCode: error.messageCode, // already lower-cased, never undefined
          details: error.details,
          requestId,
        }, error.statusCode as StatusCode);
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        return c.json({
          statusCode: 422,
          message: 'Validation failed',
          messageCode: MessageCode.DEFAULT,
          details: { cause: error.errors },
          requestId,
        }, 422);
      }

      // Unknown errors - don't expose details
      return c.json({
        statusCode: 500,
        message: 'Internal server error',
        messageCode: MessageCode.DEFAULT,
        requestId,
      }, 500);
    });
  }
}
```

## 5. Error Response Format

All errors should follow a consistent format:

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  messageCode?: string; // stable, localizable code (validation: from params.code or the raw Zod code)
  requestId: string;
  extra?: Record<string, unknown>; // structured context attached via getError(...)
  details?: {
    cause?: Array<{
      path: string;
      message: string;
      code: string;
    }>;
    [key: string]: unknown;
  };
}
```

**Example Responses:**

```json
// 400 Bad Request
{
  "statusCode": 400,
  "message": "Invalid request body",
  "messageCode": "core.system_error",
  "requestId": "abc123"
}

// 404 Not Found
// Extra keys passed to getError(...) (e.g. `details`) surface under `extra`;
// the top-level `details` object is reserved for middleware context (url, path, stack, cause).
{
  "statusCode": 404,
  "message": "User not found",
  "messageCode": "core.system_error",
  "requestId": "abc123",
  "extra": { "details": { "id": "user-uuid" } }
}

// 422 Validation Error
// `message`/`messageCode` come from the first failing issue - its `params.code` if the schema set
// one, otherwise the raw Zod code (e.g. `invalid_type`, `too_small`). The full list stays in `details.cause`.
{
  "statusCode": 422,
  "message": "Invalid email format",
  "messageCode": "user.email.invalid",
  "requestId": "abc123",
  "details": {
    "cause": [
      {
        "path": "email",
        "message": "Invalid email format",
        "code": "custom"
      }
    ]
  }
}

// 500 Internal Error (production)
{
  "statusCode": 500,
  "message": "Internal server error",
  "messageCode": "core.system_error",
  "requestId": "abc123"
}
```

## 6. Logging Errors

### `%s`, Never `%j`, for an `Error`

`message` and `stack` are non-enumerable properties on a native `Error` (and on `ApplicationError`, which extends it). `%j` serializes via `JSON.stringify`, which only visits enumerable own properties - so `logger.error('... | error: %j', error)` silently drops both `message` and `stack`, logging little more than `{}`. Always use `%s` to log an `Error` instance; reserve `%j`/`%o` for plain data objects.

```typescript
// ✅ Good - %s prints message + stack
this.logger.error('[createOrder] Failed | error: %s', error);

// ❌ Bad - %j drops message and stack (non-enumerable)
this.logger.error('[createOrder] Failed | error: %j', error);
```

### What to Log

```typescript
// ✅ Good - Context for debugging
this.logger.error('[createOrder] Failed | userId: %s | orderId: %s | error: %s',
  userId, orderId, error.message);

// ✅ Good - Include stack trace for unexpected errors
this.logger.error('[createOrder] Unexpected error | %s', error.stack);

// ❌ Bad - No context
this.logger.error(error.message);

// ❌ Bad - Sensitive data
this.logger.error('Login failed for user | password: %s', password);
```

### Log Levels

| Level | Use For |
|-------|---------|
| `error` | Exceptions that need attention |
| `warn` | Recoverable issues, deprecation warnings |
| `info` | Important business events |
| `debug` | Detailed debugging information |

```typescript
// Error - requires attention
this.logger.error('[payment] Transaction failed | orderId: %s', orderId);

// Warn - recovered but should investigate
this.logger.warn('[cache] Redis unavailable, falling back to memory');

// Info - business event
this.logger.info('[order] Created | orderId: %s | userId: %s', orderId, userId);

// Debug - detailed trace
this.logger.debug('[query] Executing | sql: %s | params: %j', sql, params);
```

## 7. Async Error Handling

### Promises

```typescript
// ✅ Good - Errors propagate naturally with async/await
async function processOrder(orderId: string) {
  const order = await orderRepository.findById({ id: orderId }); // Throws if fails
  const payment = await paymentService.charge(order); // Throws if fails
  return payment;
}

// ✅ Good - Explicit catch when you need to handle
async function processOrderWithFallback(orderId: string) {
  try {
    return await paymentService.charge(order);
  } catch (error) {
    this.logger.warn('[processOrder] Primary payment failed, trying backup');
    return await backupPaymentService.charge(order);
  }
}

// ❌ Bad - Swallowing errors
async function processOrder(orderId: string) {
  try {
    await dangerousOperation();
  } catch (error) {
    // Error is swallowed - no one knows it happened!
  }
}
```

### Fire-and-Forget with Error Handling

```typescript
// ✅ Good - Log errors from fire-and-forget operations
this.sendNotification(userId).catch(error => {
  this.logger.error('[notify] Failed | userId: %s | error: %s', userId, error.message);
});

// ✅ Good - Use void to indicate intentional fire-and-forget
void this.analytics.track('order_created', { orderId });

// ❌ Bad - Unhandled promise rejection
this.sendNotification(userId); // If this rejects, crash!
```

## 8. Transaction Error Handling

```typescript
async function transferFunds(from: string, to: string, amount: number) {
  const tx = await accountRepository.beginTransaction();

  try {
    await accountRepository.debit({ id: from, amount, options: { transaction: tx } });
    await accountRepository.credit({ id: to, amount, options: { transaction: tx } });

    await tx.commit();
    return { success: true };
  } catch (error) {
    await tx.rollback();

    // Re-throw with context
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[transferFunds] Transaction failed',
      details: { from, to, amount, originalError: error.message },
    });
  }
}
```

## 9. Client-Side Error Handling

Guide for API consumers:

```typescript
// TypeScript client example
async function createUser(data: CreateUserRequest): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();

    switch (response.status) {
      case 400:
        throw new ValidationError(error.message, error.details);
      case 401:
        // Redirect to login
        window.location.href = '/login';
        throw new AuthError('Please log in');
      case 404:
        throw new NotFoundError(error.message);
      case 422:
        // Handle field-level errors
        const fieldErrors = error.details?.cause?.reduce((acc, e) => {
          acc[e.path] = e.message;
          return acc;
        }, {});
        throw new ValidationError('Validation failed', fieldErrors);
      case 429:
        throw new RateLimitError('Too many requests. Try again later.');
      default:
        throw new ApiError(error.message || 'Something went wrong');
    }
  }

  return response.json();
}
```

## Error Handling Checklist

| Category | Check |
|----------|-------|
| **Services** | Business rule violations throw appropriate errors |
| **Repositories** | Database errors are caught and wrapped |
| **Controllers** | Errors propagate to global handler |
| **Async** | All promises have error handling |
| **Transactions** | Always rollback on error |
| **Logging** | Errors logged with context |
| **Responses** | Consistent error format returned |
| **Security** | No sensitive data in error messages |

## See Also

- [Common Pitfalls](./common-pitfalls) - Error handling mistakes
- [Testing Strategies](./testing-strategies) - Testing error scenarios
- [Troubleshooting Tips](./troubleshooting-tips) - Debugging errors
