# Error Handling

Comprehensive guide to handling errors gracefully in Ignis applications.

## Error Handling Philosophy

| Principle | Description |
|-----------|-------------|
| **Fail Fast** | Detect and report errors as early as possible |
| **Don't Swallow** | Never catch errors without logging or re-throwing |
| **User-Friendly** | Return clear, actionable messages to clients |
| **Debuggable** | Include context for debugging in logs |

## 1. Using `getError` Helper

Ignis provides `getError` for creating consistent, structured errors.

```typescript
import { getError, HTTP } from '@venizia/ignis';

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
| 409 | `RS_4.Conflict` | Resource already exists (custom duplicate handling) |
| 422 | `RS_4.UnprocessableEntity` | Validation failed (Zod errors) |
| 429 | `RS_4.TooManyRequests` | Rate limit exceeded |
| 500 | `RS_5.InternalServerError` | Unexpected server error |
| 502 | `RS_5.BadGateway` | External service failed |
| 503 | `RS_5.ServiceUnavailable` | Service temporarily down |

:::tip Automatic Database Error Handling
Database constraint violations (unique, foreign key, not null, check) are automatically converted to HTTP 400 by the global error middleware. You don't need to catch these errors manually.
:::

## 3. Error Handling Patterns

### Service Layer Errors

```typescript
import { BaseService, getError, HTTP } from '@venizia/ignis';

export class UserService extends BaseService {
  async createUser(data: TCreateUserRequest): Promise<TUser> {
    // Validate business rules
    const existingUser = await this.userRepo.findOne({
      filter: { where: { email: data.email } },
    });

    if (existingUser.data) {
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

    return this.userRepo.create({ data });
  }

  async getUserOrFail(id: string): Promise<TUser> {
    const user = await this.userRepo.findById({ id });

    if (!user.data) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        message: 'User not found',
        details: { id },
      });
    }

    return user.data;
  }
}
```

### Controller Layer Errors

Controllers should delegate to services and let the global error handler catch exceptions:

```typescript
import { BaseController, controller, get, post } from '@venizia/ignis';

@controller({ path: '/users' })
export class UserController extends BaseController {

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

Database constraint violations (unique, foreign key, not null, check) are **automatically handled** by the global error middleware. They return HTTP 400 with a human-readable message:

```json
{
  "message": "Unique constraint violation\nDetail: Key (email)=(test@example.com) already exists.\nTable: User\nConstraint: UQ_User_email",
  "statusCode": 400,
  "requestId": "abc123"
}
```

You don't need to wrap repository calls in try-catch for constraint errors. If you need custom error messages, you can still handle them explicitly:

```typescript
import { BaseRepository, getError, HTTP } from '@venizia/ignis';

export class UserRepository extends BaseRepository<typeof User.schema> {
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

Ignis includes a built-in error handler. Customize behavior in your application:

```typescript
import { BaseApplication, ApplicationError } from '@venizia/ignis';

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
          details: error.details,
          requestId,
        }, error.statusCode as StatusCode);
      }

      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        return c.json({
          statusCode: 422,
          message: 'Validation failed',
          details: { cause: error.errors },
          requestId,
        }, 422);
      }

      // Unknown errors - don't expose details
      return c.json({
        statusCode: 500,
        message: 'Internal server error',
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
  requestId: string;
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
  "requestId": "abc123"
}

// 404 Not Found
{
  "statusCode": 404,
  "message": "User not found",
  "requestId": "abc123",
  "details": { "id": "user-uuid" }
}

// 422 Validation Error
{
  "statusCode": 422,
  "message": "Validation failed",
  "requestId": "abc123",
  "details": {
    "cause": [
      {
        "path": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      }
    ]
  }
}

// 500 Internal Error (production)
{
  "statusCode": 500,
  "message": "Internal server error",
  "requestId": "abc123"
}
```

## 6. Logging Errors

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
  const order = await orderRepo.findById({ id: orderId }); // Throws if fails
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
  const tx = await accountRepo.beginTransaction();

  try {
    await accountRepo.debit({ id: from, amount }, { transaction: tx });
    await accountRepo.credit({ id: to, amount }, { transaction: tx });

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
