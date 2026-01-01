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

> **Reference:** See [Hidden Properties](../../references/base/models.md#hidden-properties) for complete documentation.

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

> **Reference:** See [Request Utility](../../references/utilities/request.md) for full API documentation.

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
