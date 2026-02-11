# Control Flow & Organization

Guidelines for control flow, logging, error handling, and code organization.

## Control Flow Patterns

### Mandatory Braces

**Always use braces for `if`, `for`, `while`, and `do-while` statements**, even for single-line bodies. Never use inline statements.

```typescript
// ✅ GOOD - Always use braces
if (condition) {
  doSomething();
}

for (const item of items) {
  process(item);
}

while (running) {
  tick();
}

do {
  attempt();
} while (retrying);

// ❌ BAD - Never inline without braces
if (condition) doSomething();
for (const item of items) process(item);
while (running) tick();
```

**Why braces are mandatory:**
- Prevents bugs when adding statements later
- Clearer code structure at a glance
- Consistent formatting across codebase

### Switch Statement Requirements

**All switch statements must:**
1. Use braces `{}` for each case block
2. Include a `default` case (even if it throws)

```typescript
// ✅ GOOD - Braces and default case
switch (status) {
  case 'active': {
    activateUser();
    break;
  }
  case 'inactive': {
    deactivateUser();
    break;
  }
  case 'pending': {
    notifyAdmin();
    break;
  }
  default: {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `Unknown status: ${status}`,
    });
  }
}

// ❌ BAD - Missing braces and default case
switch (status) {
  case 'active':
    activateUser();
    break;
  case 'inactive':
    deactivateUser();
    break;
  // Missing default case!
}
```

**Why these rules:**
- Braces prevent variable scoping issues between cases
- Default case ensures all values are handled
- Throwing in default catches unexpected values early

## Logging Patterns

### Method Context Prefix

Always include class and method context in log messages:

```typescript
// Format: [ClassName][methodName] Message with %s placeholders
this.logger.info('[binding] Asset storage bound | Key: %s | Type: %s', key, storageType);
this.logger.debug('[authenticate] Token validated | User: %s', userId);
this.logger.warn('[register] Skipping duplicate registration | Type: %s', opts.type);
this.logger.error('[generate] Token generation failed | Error: %s', error.message);
```

### Structured Data

Use format specifiers for structured logging:

```typescript
// %s - string, %d - number, %j - JSON object
this.logger.info('[create] User created | ID: %s | Email: %s', user.id, user.email);
this.logger.debug('[config] Server options: %j', this.serverOptions);
```

### Log Levels

| Level | Use For |
|-------|---------|
| `error` | Exceptions that need attention |
| `warn` | Recoverable issues, deprecations |
| `info` | Important business events |
| `debug` | Detailed debugging information |

## Standardized Error Handling

Use the `getError` helper and `HTTP` constants to throw consistent, formatted exceptions.

### Basic Error

```typescript
import { getError, HTTP } from '@venizia/ignis';

if (!record) {
  throw getError({
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    message: 'Record not found',
    details: { id: requestedId },
  });
}
```

### Error with Context

Include class/method context in error messages:

```typescript
// Format: [ClassName][methodName] Descriptive message
throw getError({
  statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
  message: '[JWTTokenService][generate] Failed to generate token',
});

throw getError({
  statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
  message: '[AuthMiddleware][authenticate] Missing authorization header',
});
```

### Validation Errors

```typescript
constructor(options: IServiceOptions) {
  if (!options.apiKey) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[PaymentService] Missing required apiKey configuration',
    });
  }
}
```

### HTTP Status Code Quick Reference

| Category | Constant | Use Case |
|----------|----------|----------|
| Success | `HTTP.ResultCodes.RS_2.Ok` | Successful response |
| Created | `HTTP.ResultCodes.RS_2.Created` | Resource created |
| Bad Request | `HTTP.ResultCodes.RS_4.BadRequest` | Invalid input |
| Unauthorized | `HTTP.ResultCodes.RS_4.Unauthorized` | Missing/invalid auth |
| Forbidden | `HTTP.ResultCodes.RS_4.Forbidden` | Insufficient permissions |
| Not Found | `HTTP.ResultCodes.RS_4.NotFound` | Resource not found |
| Internal Error | `HTTP.ResultCodes.RS_5.InternalServerError` | Server errors |

## Code Organization

### Section Separator Comments

Use visual separators for major code sections in long files:

```typescript
// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

type TMyType = { /* ... */ };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = { /* ... */ };

// ---------------------------------------------------------------------------
// Main Implementation
// ---------------------------------------------------------------------------

export class MyClass {
  // ...
}
```

**Guidelines:**
- Use for files > 200 lines with distinct sections
- Use 75-character wide separator lines
- Descriptive section names (2-4 words)

### Import Organization Order

Organize imports in this order:

```typescript
// 1. Node built-ins (with 'node:' prefix)
import fs from 'node:fs';
import path from 'node:path';

// 2. Third-party packages (alphabetical)
import { z } from '@hono/zod-openapi';
import dayjs from 'dayjs';

// 3. Internal absolute imports (by domain/package)
import { getError } from '@venizia/ignis-helpers';
import { BaseEntity } from '@/base/models';
import { UserService } from '@/services';

// 4. Relative imports (same feature) - LAST
import { AbstractRepository } from './base';
import { QueryBuilder } from '../query';
```

**Rules:**
- Blank line between each group
- Alphabetical within each group
- `node:` prefix for Node.js built-ins
- Relative imports only for same feature/module

## See Also

- [Error Handling](../error-handling) - Comprehensive error patterns
- [Logging Reference](../../references/helpers/logger/) - Logger API
- [Function Patterns](./function-patterns) - Method organization
