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

> **Deep Dive:** See [Authentication Component](../references/components/authentication.md) for full setup guide.

**Access user in protected routes:**
```typescript
import { Authentication, IJWTTokenPayload, ApplicationError, getError } from '@venizia/ignis';

const user = c.get(Authentication.CURRENT_USER) as IJWTTokenPayload;
if (!user.roles.includes('admin')) {
    throw getError({ statusCode: 403, message: 'Forbidden' });
}
```

## 4. Protecting Sensitive Data with Hidden Properties

Configure model properties that should **never be returned** through repository queries. Hidden properties are excluded at the SQL level - they never leave the database.

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'apiSecret', 'internalToken'],
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),      // Never returned via repository
    apiSecret: text('api_secret'),   // Never returned via repository
  });
}
```

**Why SQL-level exclusion matters:**

| Approach | Security Level | Data Exposure Risk |
|----------|---------------|-------------------|
| Post-query filtering (JS) | Low | Data passes through network/memory |
| **SQL-level exclusion** | **High** | **Data never leaves database** |

**When you legitimately need hidden data** (e.g., password verification), use the connector directly:

```typescript
// For authentication - access password via connector
const connector = userRepo.getConnector();
const [user] = await connector
  .select({ id: User.schema.id, password: User.schema.password })
  .from(User.schema)
  .where(eq(User.schema.email, email));
```

> **Reference:** See [Hidden Properties](../references/base/models.md#hidden-properties) for complete documentation.

## 5. File Upload Security

When handling file uploads, prevent **path traversal attacks** and ensure safe file handling.

### Path Traversal Prevention

**Problem:** Malicious filenames like `../../../etc/passwd` can write files outside intended directories.

**Solution:** Use `sanitizeFilename()` to strip dangerous patterns:

```typescript
import { sanitizeFilename } from '@venizia/ignis';

// ❌ DANGEROUS - User-controlled filename
const unsafeFilename = req.body.filename; // Could be "../../../etc/passwd"
fs.writeFileSync(`./uploads/${unsafeFilename}`, data);

// ✅ SAFE - Sanitized filename
const safeFilename = sanitizeFilename(req.body.filename);
fs.writeFileSync(`./uploads/${safeFilename}`, data);
```

**What `sanitizeFilename()` does:**
- Extracts basename (removes directory paths)
- Removes dangerous characters (`../`, special chars)
- Replaces consecutive dots with single dot
- Returns `'download'` for empty/suspicious patterns

### Safe File Download Headers

Use `createContentDispositionHeader()` for secure download responses:

```typescript
import { createContentDispositionHeader, sanitizeFilename } from '@venizia/ignis';

async downloadFile(c: Context) {
  const filename = sanitizeFilename(c.req.param('filename'));
  const fileBuffer = await fs.readFile(`./uploads/${filename}`);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': createContentDispositionHeader({
        filename: filename,
        type: 'attachment',
      }),
    },
  });
}
```

### Built-in Multipart Parsing

Use `parseMultipartBody()` for safe file uploads with automatic sanitization:

```typescript
import { parseMultipartBody } from '@venizia/ignis';

async uploadFile(c: Context) {
  const files = await parseMultipartBody({
    context: c,
    storage: 'disk',        // or 'memory' for buffer
    uploadDir: './uploads', // Target directory
  });

  // Files are saved with sanitized names: timestamp-random-sanitized_name.ext
  return c.json({ uploaded: files.map(f => f.filename) });
}
```

**Security features:**
- Automatic filename sanitization
- Creates upload directory if missing
- Generates unique filenames (prevents overwrites)
- Returns file metadata (size, mimetype) for validation

> **Reference:** See [Request Utility](../references/utilities/request.md) for full API documentation.

## 6. Secure Dependencies

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

## 7. CORS Configuration

Configure Cross-Origin Resource Sharing to control which domains can access your API.

**Default (Development):**
```typescript
import { cors } from 'hono/cors';

// Allow all origins (ONLY for development)
this.server.use('*', cors());
```

**Production (Restrictive):**
```typescript
import { cors } from 'hono/cors';

this.server.use('/api/*', cors({
  origin: ['https://yourdomain.com', 'https://app.yourdomain.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24 hours
}));
```

**Dynamic Origin Validation:**
```typescript
this.server.use('/api/*', cors({
  origin: (origin) => {
    const allowedDomains = ['yourdomain.com', 'yourdomain.io'];
    try {
      const url = new URL(origin);
      return allowedDomains.some(domain => url.hostname.endsWith(domain))
        ? origin
        : null;
    } catch {
      return null;
    }
  },
}));
```

> [!WARNING]
> Never use `origin: '*'` with `credentials: true` in production. This is a security vulnerability.

## 8. Rate Limiting

Protect against brute force attacks and denial of service.

**Basic Rate Limiter:**
```typescript
import { createMiddleware } from 'hono/factory';

const rateLimiter = (opts: { windowMs: number; max: number }) => {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return createMiddleware(async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetAt) {
      requests.set(ip, { count: 1, resetAt: now + opts.windowMs });
    } else if (record.count >= opts.max) {
      return c.json({
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
      }, 429);
    } else {
      record.count++;
    }

    await next();
  });
};

// Apply to sensitive endpoints
this.server.use('/api/auth/login', rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }));
this.server.use('/api/auth/register', rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }));
this.server.use('/api/*', rateLimiter({ windowMs: 60 * 1000, max: 100 }));
```

**Recommended Limits:**

| Endpoint | Window | Max Requests | Reason |
|----------|--------|--------------|--------|
| `/auth/login` | 15 min | 5 | Prevent brute force |
| `/auth/register` | 1 hour | 10 | Prevent spam accounts |
| `/auth/forgot-password` | 1 hour | 3 | Prevent email flooding |
| `/api/*` (general) | 1 min | 100 | General protection |

**Production Recommendation:** Use Redis-backed rate limiting for distributed deployments:

```typescript
import { RedisHelper } from '@venizia/ignis-helpers';

// Rate limiter with Redis for multi-instance deployments
const distributedRateLimiter = async (key: string, max: number, windowSec: number) => {
  const redis = RedisHelper.getClient();
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSec);
  }
  return current <= max;
};
```

## 9. SQL Injection Prevention

Drizzle ORM automatically parameterizes queries, protecting against SQL injection. However, **raw queries require care**.

**Safe (Parameterized):**
```typescript
// ✅ Repository methods are safe - queries are parameterized
await userRepository.find({
  filter: { where: { email: userInput } },
});

// ✅ Drizzle query builder is safe
await db.select().from(users).where(eq(users.email, userInput));

// ✅ sql`` template with placeholders is safe
await db.execute(sql`SELECT * FROM users WHERE email = ${userInput}`);
```

**Dangerous (String Interpolation):**
```typescript
// ❌ NEVER use string interpolation in raw SQL
const query = `SELECT * FROM users WHERE email = '${userInput}'`;
await db.execute(sql.raw(query)); // Vulnerable to SQL injection!

// ❌ NEVER build WHERE clauses with string concatenation
const condition = `status = '${status}' AND role = '${role}'`;
```

**If You Must Use Dynamic SQL:**
```typescript
// Use parameterized queries with sql.raw only for table/column names
const tableName = allowedTables.includes(input) ? input : 'default_table';
await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)} WHERE id = ${id}`);
```

## 10. Security Headers

Add security headers to protect against common attacks:

```typescript
import { secureHeaders } from 'hono/secure-headers';

// Add security headers to all responses
this.server.use('*', secureHeaders({
  // Prevent clickjacking
  xFrameOptions: 'DENY',
  // Prevent MIME type sniffing
  xContentTypeOptions: 'nosniff',
  // Enable XSS filter
  xXssProtection: '1; mode=block',
  // Control referrer information
  referrerPolicy: 'strict-origin-when-cross-origin',
  // Content Security Policy
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
  },
}));
```

## 11. Request Size Limits

Prevent denial of service through large payloads:

```typescript
import { bodyLimit } from 'hono/body-limit';

// Limit request body size
this.server.use('/api/*', bodyLimit({
  maxSize: 1024 * 1024, // 1MB for general API
  onError: (c) => c.json({ message: 'Request body too large' }, 413),
}));

// Allow larger uploads for file endpoints
this.server.use('/api/upload/*', bodyLimit({
  maxSize: 50 * 1024 * 1024, // 50MB for file uploads
}));
```

## 12. Logging Security Events

Log security-relevant events for monitoring and forensics:

```typescript
import { BaseService } from '@venizia/ignis';

export class AuthService extends BaseService {
  async login(email: string, password: string, context: Context) {
    const ip = context.req.header('x-forwarded-for') ?? 'unknown';
    const userAgent = context.req.header('user-agent') ?? 'unknown';

    const user = await this.userRepo.findByEmail(email);

    if (!user || !await this.verifyPassword(password, user.password)) {
      // Log failed attempt
      this.logger.warn('[login] Failed login attempt | email: %s | ip: %s | userAgent: %s',
        email, ip, userAgent);
      throw getError({ statusCode: 401, message: 'Invalid credentials' });
    }

    // Log successful login
    this.logger.info('[login] Successful login | userId: %s | ip: %s', user.id, ip);

    return this.generateToken(user);
  }
}
```

**Events to Log:**
- Failed login attempts
- Successful logins
- Password changes
- Permission changes
- Suspicious activity (rate limit hits, invalid tokens)
- Admin actions

## Security Checklist

Before deploying to production, verify:

| Category | Check |
|----------|-------|
| **Secrets** | All secrets in environment variables, not in code |
| **Auth** | JWT tokens have reasonable expiration (15min - 24h) |
| **Input** | All user input validated with Zod schemas |
| **CORS** | Specific origins configured, not `*` |
| **Rate Limiting** | Applied to auth endpoints and general API |
| **Headers** | Security headers configured |
| **Logging** | Security events logged for monitoring |
| **Dependencies** | No known vulnerabilities (`bun audit`) |
| **HTTPS** | TLS configured for production |
| **Hidden Data** | Sensitive fields use `hiddenProperties` |

## See Also

- [Authentication Component](../references/components/authentication) - JWT setup and configuration
- [Common Pitfalls](./common-pitfalls) - Security-related mistakes to avoid
- [Deployment Strategies](./deployment-strategies) - Secure deployment practices
