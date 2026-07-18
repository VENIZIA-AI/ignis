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

// Error with context - any key the framework does not model lands in `extra`
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
  message: 'Invalid request',
  details: { field: 'email', reason: 'Must be a valid email address' },
});
// -> error.extra.details

// The same thing, explicit. Prefer this when the context could be mistaken for a field.
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
  message: 'Invalid request',
  extra: { details: { field: 'email' } },
});

// Wrapping a lower-level failure - `cause` reaches the native Error.cause
throw getError({
  statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
  message: '[UserService][create] Database connection failed',
  cause: error,
  extra: { userId: requestedId },
});
```

> [!NOTE]
> Any key `getError` does not model rides into `extra` - that is how a throw site attaches context the framework knows nothing about. The trade is that a **misspelling** goes the same way: `getError({ message, statuscode: 503 })` compiles, `statusCode` stays `400`, and `503` sits in `extra.statuscode`. The framework cannot tell your context from your typo.

### Catalogue a domain failure, raise the rest free-form

The form above is right for a failure that carries no i18n code: an invariant, a misconfiguration, a seed guard. Nobody translates `'[UserService][create] Database connection failed'`.

A **domain** failure - one a client localizes and branches on - belongs in a catalog instead. Retyping its code and status at each throw is how two call sites end up raising `category.create.duplicate_name` and `category.duplicate_name` for the same thing:

```typescript
import { ErrorScopes, getError, HTTP } from '@venizia/ignis-helpers';
import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers';

export const UserErrors = {
  CREATE_DUPLICATE_EMAIL: {
    message: {
      text: 'An account with %{email} already exists.',
      code: 'server.core.user.create.duplicate_email',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
    description: 'Sign-up rejected because the email is already registered.',
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof UserErrors> {}
}

// At every throw site:
throw getError({ error: UserErrors.CREATE_DUPLICATE_EMAIL, messageArgs: { email } });
```

Pass the definition as `error` - **never spread it**. `getError({ ...UserErrors.CREATE_DUPLICATE_EMAIL, messageArgs: { email } })` reads naturally and is wrong: spreading skips the `error:` field entirely, so `category` and `description` - fields only modeled inside a definition - fall through into `extra` instead of staying structured. `statusCode` and `message` happen to still resolve correctly only because their shapes collide with what `getError` expects standalone; nothing catches the rest for you.

See the [Error helper reference](/extensions/helpers/error/) for the full surface.

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
      // Log but don't fail user creation - never a silent catch
      this.logger.error('[createUser] Failed to send welcome email | email: %s | error: %s',
        data.email, error);
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
  "statusCode": 400,
  "normalized": {
    "text": "Unique constraint violation\nDetail: Key (email)=(test@example.com) already exists.\nTable: User\nConstraint: UQ_User_email",
    "code": "core.system_error",
    "args": {}
  },
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "stack": "Error: Unique constraint violation\n    at ..."
  }
}
```

:::warning Production sanitizes database internals
In production the message is the **base message only** - `Detail:` (which echoes row values like emails), `Table:`, and `Constraint:` are stripped, and `details.stack`/`details.cause` are omitted. Unexpected (non-client) database errors and connection failures return a generic `"Internal Server Error"`, so SQL, schema names, and connection host/port never leak. Use `requestId` + server logs to diagnose.

```json
{
  "message": "Unique constraint violation",
  "statusCode": 400,
  "normalized": { "text": "Unique constraint violation", "code": "core.system_error", "args": {} },
  "requestId": "abc123",
  "details": { "url": "http://localhost:3000/users", "path": "/users" }
}
```
:::

You don't need to wrap repository calls in try-catch for constraint errors. If you need custom error messages, you can still handle them explicitly:

```typescript
import { DefaultRelationalRepository, type TCount } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

export class UserRepository extends DefaultRelationalRepository<typeof User.schema> {
  async createWithCustomError(data: TCreateUser): Promise<TCount & { data: TUser }> {
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

IGNIS wires a built-in handler by default - `AppErrorMiddleware` from `@venizia/ignis` is a class, registered as `new AppErrorMiddleware({ logger, rootKey }).value()`, and `value()` returns the Hono `ErrorHandler`. You rarely need to replace it; when you do, keep the same response contract:

```typescript
import { BaseApplication } from '@venizia/ignis';
import { isApplicationError, MessageCode } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override setupMiddlewares(): void {
    super.setupMiddlewares();

    // Custom error handler (optional) - the default AppErrorMiddleware already does this.
    // `this.server` is `{ hono, runtime, instance }` - reach the Hono app via getServer().
    this.getServer().onError((error, c) => {
      const requestId = c.get('requestId') ?? 'unknown';

      // Log all errors
      this.logger.error('[%s] Error | %s', requestId, error);

      // Handle known application errors - isApplicationError(), never `instanceof
      // ApplicationError` (unreliable across package boundaries)
      if (isApplicationError(error)) {
        return c.json({
          statusCode: error.statusCode,
          message: error.message,
          normalized: error.normalized, // { text, code, args } - never undefined
          extra: error.extra,
          requestId,
        }, error.statusCode as Parameters<typeof c.json>[1]);
      }

      // Handle Zod validation errors - Zod v4 exposes `issues`, not `errors`
      if (error.name === 'ZodError') {
        return c.json({
          statusCode: 422,
          message: 'Validation failed',
          normalized: { text: 'Validation failed', code: MessageCode.DEFAULT, args: {} },
          details: { cause: error.issues },
          requestId,
        }, 422);
      }

      // Unknown errors - don't expose details
      return c.json({
        statusCode: 500,
        message: 'Internal server error',
        normalized: { text: 'Internal server error', code: MessageCode.DEFAULT, args: {} },
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
  normalized: {
    text: string;
    code: string; // stable, localizable code (validation: from params.code or the raw Zod code)
    args: Record<string, unknown>;
  };
  requestId: string;
  extra?: Record<string, unknown>; // structured context attached via getError(...)
  details: {
    url: string;
    path: string;
    stack?: string; // non-production only
    cause?: unknown; // non-production only, or the Zod issue list for 422s
    [key: string]: unknown;
  };
}
```

There is no top-level `messageCode` - read `normalized.code`. `extra` never mirrors `messageArgs`; the resolved interpolation values live at `normalized.args`.

**Example Responses:**

```json
// 400 Bad Request
{
  "message": "Invalid request body",
  "statusCode": 400,
  "normalized": { "text": "Invalid request body", "code": "core.system_error", "args": {} },
  "requestId": "abc123",
  "details": { "url": "http://localhost:3000/users", "path": "/users" }
}

// 404 Not Found
// Extra keys passed to getError(...) (e.g. `details`) surface under `extra`;
// the top-level `details` object is reserved for middleware context (url, path, stack, cause).
{
  "message": "User not found",
  "statusCode": 404,
  "normalized": { "text": "User not found", "code": "core.system_error", "args": {} },
  "requestId": "abc123",
  "extra": { "details": { "id": "user-uuid" } },
  "details": { "url": "http://localhost:3000/users/user-uuid", "path": "/users/:id" }
}

// 422 Validation Error
// `message`/`normalized.code` come from the first failing issue - its `params.code` if the schema
// set one, otherwise the raw Zod code (e.g. `invalid_type`, `too_small`). `normalized.args` is
// always empty for a Zod issue; the full list of issues stays in `details.cause`.
{
  "message": "Invalid email format",
  "statusCode": 422,
  "normalized": { "text": "Invalid email format", "code": "user.email.invalid", "args": {} },
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
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
  "message": "Internal server error",
  "statusCode": 500,
  "normalized": { "text": "Internal server error", "code": "core.system_error", "args": {} },
  "requestId": "abc123",
  "details": { "url": "http://localhost:3000/orders", "path": "/orders" }
}
```

## 6. Logging Errors

### `%s`, Never `%j`, for an `Error`

`message` and `stack` are non-enumerable properties on a native `Error` (and on `ApplicationError`, which extends it). `%j` serializes via `JSON.stringify`, which only visits enumerable own properties - so `logger.error('... | error: %j', error)` silently drops both. Always use `%s` to log an `Error` instance; reserve `%j`/`%o` for plain data objects.

```typescript
// ✅ Good - %s prints message + stack
this.logger.error('[createOrder] Failed | error: %s', error);

// ❌ Bad - %j drops the stack
this.logger.error('[createOrder] Failed | error: %j', error);
```

> [!NOTE]
> An `ApplicationError` logged with `%j` does show its message text, because the text rides inside the enumerable `normalized.text`. That is incidental, not a reprieve: the **stack** is still gone, which is the reason the rule exists. A plain `Error` under `%j` still logs little more than `{}`.

### What to Log

```typescript
// ✅ Good - Context for debugging. `%s` on the error itself carries message + stack
this.logger.error('[createOrder] Failed | userId: %s | orderId: %s | error: %s',
  userId, orderId, error);

// ❌ Bad - No context, and `.message` throws the stack away
this.logger.error(error.message);

// ❌ Bad - Sensitive data
this.logger.error('Login failed for user | password: %s', password);
```

### Log Levels

`ILogger` has exactly five levels, each a direct method. `alert`, `http`, `verbose` and `silly` do not exist.

| Level | Use For |
|-------|---------|
| `emerg` | The process cannot continue - unrecoverable |
| `error` | Exceptions that need attention |
| `warn` | Recoverable issues, deprecation warnings |
| `info` | Important business events |
| `debug` | Detailed debugging information (gated on `DEBUG`) |

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
const processOrder = async (orderId: string) => {
  const order = await orderRepository.findById({ id: orderId }); // Throws if fails
  return paymentService.charge(order); // Throws if fails
};

// ✅ Good - Explicit catch when you need to handle
const processOrderWithFallback = async (order: TOrder) => {
  try {
    return await paymentService.charge(order);
  } catch (error) {
    this.logger.warn('[processOrder] Primary payment failed, trying backup | error: %s', error);
    return backupPaymentService.charge(order);
  }
};

// ❌ Bad - Swallowing errors
const processOrderSilently = async () => {
  try {
    await dangerousOperation();
  } catch (error) {
    // Error is swallowed - no one knows it happened!
  }
};
```

### Fire-and-Forget with Error Handling

```typescript
// ✅ Good - Log errors from fire-and-forget operations
this.sendNotification(userId).catch(error => {
  this.logger.error('[notify] Failed | userId: %s | error: %s', userId, error);
});

// ✅ Good - Use void to indicate intentional fire-and-forget
void this.analytics.track('order_created', { orderId });

// ❌ Bad - Unhandled promise rejection
this.sendNotification(userId); // If this rejects, crash!
```

## 8. Transaction Error Handling

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

const transferFunds = async (opts: { from: string; to: string; amount: number }) => {
  const { from, to, amount } = opts;
  const transaction = await accountRepository.beginTransaction();

  try {
    await accountRepository.debit({ id: from, amount, options: { transaction } });
    await accountRepository.credit({ id: to, amount, options: { transaction } });

    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();

    // Re-throw with context
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[transferFunds] Transaction failed',
      cause: error,
      extra: { from, to, amount },
    });
  }
};
```

> [!NOTE]
> `rollback()` throws on failure, so it belongs in the `catch` exactly as above - never after a
> `commit()` you already awaited outside one. A rollback that follows a **failed** commit is a
> deliberate no-op: the transaction is already torn down, so this canonical shape stays safe.

## 9. Client-Side Error Handling

Guide for API consumers:

```typescript
// TypeScript client example
const createUser = async (data: TCreateUserRequest): Promise<TUser> => {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();

    // Branch on `normalized.code` - it is always present. There is no top-level `messageCode`.
    switch (response.status) {
      case 400: {
        // Context passed to getError(...) arrives under `extra`, not `details`
        throw new ValidationError(error.message, error.extra);
      }
      case 401: {
        window.location.href = '/login';
        throw new AuthError('Please log in');
      }
      case 404: {
        throw new NotFoundError(error.message);
      }
      case 422: {
        // Field-level issues live in details.cause
        const fieldErrors = error.details?.cause?.reduce((accumulator, issue) => {
          accumulator[issue.path] = issue.message;
          return accumulator;
        }, {});
        throw new ValidationError(error.normalized.code, fieldErrors);
      }
      case 429: {
        throw new RateLimitError('Too many requests. Try again later.');
      }
      default: {
        throw new ApiError(error.message || 'Something went wrong');
      }
    }
  }

  return response.json();
};
```

## Error Handling Checklist

| Category | Check |
|----------|-------|
| **Services** | Business rule violations throw appropriate errors |
| **Repositories** | Constraint errors left to the global handler; only custom messages wrapped |
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
