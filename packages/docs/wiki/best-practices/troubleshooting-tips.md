# Troubleshooting Tips

Common issues and their solutions when building Ignis applications.

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
  debug: {
    showRoutes: process.env.NODE_ENV !== 'production',
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
// In postConfigure() method
async postConfigure(): Promise<void> {
  this.logger.info('Available bindings: %s',
    Array.from(this.bindings.keys())
  );
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
# Enable debug mode via environment variable
DEBUG=true
```

**Use method-scoped logging with `.for()`:**
```typescript
class UserService {
  private logger = Logger.get('UserService');

  async createUser(data: CreateUserDto) {
    this.logger.for('createUser').info('Creating user: %j', data);
    // Output: [UserService-createUser] Creating user: {...}

    try {
      const user = await this.userRepo.create({ data });
      this.logger.for('createUser').info('User created: %s', user.id);
      return user;
    } catch (error) {
      this.logger.for('createUser').error('Failed: %s', error);
      throw error;
    }
  }
}
```

**Common debugging commands:**
```bash
# View application logs
tail -f logs/app.log

# Check TypeScript compilation errors
bun run build

# Validate environment variables
cat .env | grep APP_ENV
```

**Useful debugging patterns:**
- Use `logger.for('methodName')` to trace execution with method context
- Use `try-catch` blocks to catch and log errors
- Check database queries with Drizzle's logging: `{ logger: true }`

> **Deep Dive:** See [Logger Helper](../references/helpers/logger.md) for advanced logging configuration.

## 6. Request ID Tracking

Every request in Ignis is automatically assigned a unique `requestId` for log correlation. The `RequestSpyMiddleware` logs this ID at the start and end of each request.

**Log output format:**
```
[spy][abc123] START | Handling Request | forwardedIp: 192.168.1.1 | path: /api/users | method: GET
[spy][abc123] DONE  | Handling Request | forwardedIp: 192.168.1.1 | path: /api/users | method: GET | Took: 45.2 (ms)
```

**Access request ID in handlers:**
```typescript
import { RequestSpyMiddleware } from '@venizia/ignis';

// Inside a controller method
async getUser(c: Context) {
  const requestId = c.get(RequestSpyMiddleware.REQUEST_ID_KEY);
  this.logger.info('[%s] Processing user request', requestId);
  // ...
}
```

**Filtering logs by request:**
```bash
# Find all logs for a specific request
grep "abc123" logs/app.log

# Extract request timing
grep "\[spy\]\[abc123\]" logs/app.log
```

**Why this matters:**
- Correlate logs across services in distributed systems
- Debug specific user issues by their request ID
- Measure request duration from START to DONE timestamps

## 7. Validation Error Debugging

When Zod validation fails, Ignis returns a structured error response. Understanding this format helps debug client-side issues.

**Error response structure:**
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
      }
    ]
  }
}
```

**Common validation error codes:**

| Code | Meaning | Example |
|------|---------|---------|
| `invalid_type` | Wrong data type | Expected `number`, got `string` |
| `invalid_string` | String format invalid | Invalid email or UUID format |
| `too_small` | Value below minimum | String shorter than min length |
| `too_big` | Value above maximum | Number exceeds max value |
| `invalid_enum_value` | Value not in enum | Status must be 'ACTIVE' or 'INACTIVE' |
| `unrecognized_keys` | Extra fields in request | Strict schema rejects unknown fields |

**Debugging tips:**

1. **Check the `path` field** - Shows which field failed validation
2. **Compare `expected` vs `received`** - Identifies type mismatches
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