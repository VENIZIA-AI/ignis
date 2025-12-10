# Security Guidelines

Critical security practices to protect your Ignis application.

## 1. Secret Management

**Never hard-code secrets.** Use environment variables for all sensitive data.

| Environment | Where to Store Secrets |
|-------------|----------------------|
| Development | `.env` file (add to `.gitignore`) |
| Production | Cloud provider's secret manager (AWS Secrets Manager, Azure Key Vault, etc.) |

**Example `.env`:**
```bash
APP_ENV_APPLICATION_SECRET=your_strong_random_secret_here
APP_ENV_JWT_SECRET=another_strong_random_secret_here
APP_ENV_POSTGRES_PASSWORD=database_password_here
```

**Generate strong secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 2. Input Validation

**Always validate incoming data** with Zod schemas. Ignis automatically rejects invalid requests.

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent, jsonResponse } from '@venizia/ignis';

const CreateUserRoute = {
  method: 'post',
  path: '/users',
  request: {
    body: jsonContent({
      schema: z.object({
        email: z.string().email(),           // Valid email
        age: z.number().int().min(18),       // Adult only
        role: z.enum(['user', 'admin']),     // Whitelist
      }),
    }),
  },
  responses: jsonResponse({ /* ... */ }),
} as const;
```

**Validation happens automatically** - invalid requests never reach your handler.

## 3. Authentication & Authorization

Protect sensitive endpoints with `AuthenticateComponent`.

**Setup:**
```typescript
// application.ts
this.component(AuthenticateComponent);
```

**Protect routes:**
```typescript
const SecureRoute = {
  path: '/admin/users',
  authStrategies: [Authentication.STRATEGY_JWT], // Requires JWT
  // ...
};
```

> **Deep Dive:** See [Authentication Component](../../references/components/authentication.md) for full setup guide.

**Access user in protected routes:**
```typescript
const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload;
if (!user.roles.includes('admin')) {
    throw new ApplicationError({ statusCode: 403, message: 'Forbidden' });
}
```

## 4. Secure Dependencies

Regularly audit and update dependencies:

```bash
# Check for vulnerabilities
bun audit

# Update dependencies
bun update
```

**Critical packages to keep updated:**
- `hono` - Web framework
- `jose` - JWT handling
- `drizzle-orm` - Database ORM
- `@venizia/ignis` - Framework core
