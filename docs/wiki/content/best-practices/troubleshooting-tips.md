# Troubleshooting Tips

Common issues and their solutions when building IGNIS applications.

## 1. Application Fails to Start

| Symptom | Cause | Solution |
|---------|-------|----------|
| App exits immediately | Missing environment variables | Check `.env` file has all required vars (especially `APP_ENV_APPLICATION_SECRET`, `APP_ENV_JWT_SECRET`) |
| Connection error on startup | Database unreachable | Verify `APP_ENV_POSTGRES_*` values and PostgreSQL is running |
| `Error: listen EADDRINUSE` | Port already in use | Change `APP_ENV_SERVER_PORT` or stop conflicting process |

**Quick fix:**
```bash
# Check if PostgreSQL is running
psql -U postgres -c "SELECT 1;"

# Find process using port 3000
lsof -ti:3000 | xargs kill -9
```

## 2. API Endpoint Returns 404

| Cause | Check | Fix |
|-------|-------|-----|
| Controller not registered | Missing in `application.ts` | Add `this.controller(MyController)` to `preConfigure()` |
| Incorrect path | Typo in route path | Verify `@controller({ path })` and route path match URL |
| Wrong base path | Missing `/api` prefix | Check `path.base` in application config |

**Debug routes:**
```typescript
// In application.ts config
export const appConfigs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  debug: {
    shouldShowRoutes: process.env.NODE_ENV !== 'production',
  },
};
```

This prints all registered routes on startup.

## 3. Dependency Injection Fails (`Binding not found`)

| Cause | Example Error | Fix |
|-------|--------------|-----|
| Resource not registered | `Binding 'services.MyService' not found` | Add `this.service(MyService)` to `preConfigure()` |
| Wrong injection key | Key mismatch or typo | Use `BindingKeys.build()` helper |
| Wrong namespace | Using `repository` instead of `service` | Check correct namespace in `@inject` |

**Debug bindings:**
```typescript
// In your Application class - `bindings` is protected on the container it extends
override async postConfigure(): Promise<void> {
  this.logger.info('[postConfigure] Available bindings: %j', Array.from(this.bindings.keys()));
}
```

## 4. Authentication Fails (401 Unauthorized)

| Symptom | Cause | Solution |
|---------|-------|----------|
| `401 Unauthorized` on protected route | Missing Authorization header | Add `Authorization: Bearer <token>` header |
| Token expired | JWT past expiration | Request new token from login endpoint |
| Invalid signature | Wrong `JWT_SECRET` | Ensure `APP_ENV_JWT_SECRET` matches across services |
| Malformed header | Missing "Bearer " prefix | Format: `Bearer eyJhbGc...` |

**Test with curl:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/protected-route
```

## 5. General Debugging Tips

**Enable detailed logging:**
```bash
# `debug` is the only gated level - it is dropped unless DEBUG is set
DEBUG=true

# File logging is OPT-IN. Without this, logs go to console/dgram only
APP_ENV_LOGGER_FOLDER_PATH=./logs
```

**Use method-scoped logging with `.for()`:**
```typescript
import { ApplicationLogger, type ILogger } from '@venizia/ignis-helpers';

class UserService {
  private logger: ILogger = ApplicationLogger.get('UserService');

  async createUser(data: TCreateUserRequest) {
    this.logger.for('createUser').info('Creating user: %j', data);
    // Output: [UserService-createUser] Creating user: {...}

    try {
      const user = await this.userRepository.create({ data });
      this.logger.for('createUser').info('User created: %s', user.data.id);
      return user;
    } catch (error) {
      this.logger.for('createUser').error('Failed: %s', error);
      throw error;
    }
  }
}
```

Annotate against `ILogger`, never a concrete provider class. Acquire a logger via `BaseHelper.logger` (inside any helper, service, controller or repository), `ApplicationLogger.get('Scope')`, or `LoggerFactory.getLogger(['A', 'B'])`.

**Common debugging commands:**
```bash
# View application logs - the rotating files are <APP_ENV_APPLICATION_NAME>-info-<date>.log
# and -error-<date>.log inside APP_ENV_LOGGER_FOLDER_PATH
tail -f "$APP_ENV_LOGGER_FOLDER_PATH"/*-info-*.log

# Check TypeScript compilation errors (from the repo root)
make core

# Validate environment variables
grep APP_ENV .env
```

**Useful debugging patterns:**
- Use `logger.for('methodName')` to trace execution with method context
- Use `try-catch` blocks to catch and log errors
- Check database queries with Drizzle's logging: `{ logger: true }`

> **Deep Dive:** See [Logger Helper](../extensions/helpers/logger/) for advanced logging configuration.

## 6. Request ID Tracking

Every request in IGNIS is automatically assigned a unique `requestId` for log correlation (via `RequestTrackerComponent`, which registers Hono's `requestId()` middleware plus a request-spy middleware). The spy middleware logs this ID when a request starts (`[=>]`) and finishes (`[<=]`).

**Log output format:**
```
[SpyMW] [abc123][192.168.1.1][=>] GET      /api/users | query: {}
[SpyMW] [abc123][192.168.1.1][<=] GET      /api/users | Took: 45.20 (ms)
```

**Access request ID in handlers:**
```typescript
// Inside a controller method - 'requestId' is the Hono request-id context variable
async getUser(c: Context) {
  const requestId = c.get('requestId');
  this.logger.info('[%s] Processing user request', requestId);
  // ...
}
```

**Filtering logs by request:**
```bash
# Find all logs for a specific request
grep "abc123" "$APP_ENV_LOGGER_FOLDER_PATH"/*-info-*.log

# Extract request timing
grep "\[abc123\]" "$APP_ENV_LOGGER_FOLDER_PATH"/*-info-*.log | grep "Took:"
```

**Why this matters:**
- Correlate logs across services in distributed systems
- Debug specific user issues by their request ID
- Measure request duration from the `[=>]` / `[<=]` log pair

## 7. Validation Error Debugging

When Zod validation fails, IGNIS returns a structured error response. Understanding this format helps debug client-side issues.

**Error response structure** (`message`/`normalized.code` come from the first issue; the fallback message is `ValidationError`):
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
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "cause": [
      {
        "path": "email",
        "message": "Invalid email address",
        "code": "invalid_format"
      }
    ]
  }
}
```

**Common validation error codes (Zod v4):**

| Code | Meaning | Example |
|------|---------|---------|
| `invalid_type` | Wrong data type | Expected `number`, got `string` |
| `invalid_format` | String format invalid | Invalid email or UUID format |
| `too_small` | Value below minimum | String shorter than min length |
| `too_big` | Value above maximum | Number exceeds max value |
| `invalid_value` | Value not in enum/literal | Status must be 'ACTIVE' or 'INACTIVE' |
| `unrecognized_keys` | Extra fields in request | Strict schema rejects unknown fields |

**Debugging tips:**

1. **Check the `path` field** - Shows which field failed validation
2. **Compare `expected` vs `received`** - Present on `invalid_type` issues, identifies type mismatches
3. **Review schema definition** - Ensure client sends correct format

**Example: Debugging nested validation errors:**
```json
{
  "details": {
    "cause": [
      {
        "path": "address.zipCode",
        "message": "Expected string, received number",
        "code": "invalid_type",
        "expected": "string",
        "received": "number"
      }
    ]
  }
}
```

The `path` uses dot notation for nested objects. Here, `address.zipCode` means the `zipCode` field inside the `address` object is invalid.