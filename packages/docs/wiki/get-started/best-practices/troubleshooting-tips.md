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
```typescript
// Increase log verbosity
LoggerFactory.setLevel('debug');
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
- Add `console.log()` in route handlers to trace execution
- Use `try-catch` blocks to catch and log errors
- Check database queries with Drizzle's logging: `{ logger: true }`

> **Deep Dive:** See [Logger Helper](../../references/helpers/logger.md) for advanced logging configuration.