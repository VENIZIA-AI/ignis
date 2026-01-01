# Code Style Standards

Maintain consistent code style using **Prettier** (formatting) and **ESLint** (code quality). Ignis provides centralized configurations via the `@venizia/dev-configs` package.

## Using @venizia/dev-configs

Install the centralized development configurations:

```bash
bun add -d @venizia/dev-configs
```

This package provides:
- **ESLint rules** - Pre-configured for Node.js/TypeScript projects
- **Prettier settings** - Consistent formatting across all Ignis projects
- **TypeScript configs** - Shared base and common configurations

### Prettier Configuration

Automatic code formatting eliminates style debates.

**`.prettierrc.mjs`:**
```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**Default Settings:**
- `bracketSpacing: true` - `{ foo: bar }`
- `singleQuote: false` - `"string"` (double quotes)
- `printWidth: 100` - Maximum line length
- `trailingComma: 'all'` - `[1, 2, 3,]`
- `arrowParens: 'avoid'` - `x => x` not `(x) => x`
- `semi: true` - Semicolons required

**Customization:**
```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default {
  ...prettierConfigs,
  printWidth: 120,  // Override specific settings
};
```

**Usage:**
```bash
bun run prettier:cli      # Check formatting
bun run prettier:fix      # Auto-fix
```

### ESLint Configuration

Prevents common errors and enforces best practices.

**`eslint.config.mjs`:**
```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**Includes:**
- Pre-configured rules for Node.js/TypeScript (via `@minimaltech/eslint-node`)
- Disables `@typescript-eslint/no-explicit-any` by default

**Customization:**
```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,
  {
    rules: {
      'no-console': 'warn',  // Add project-specific rules
    },
  },
];
```

**Usage:**
```bash
bun run eslint           # Check for issues
bun run eslint --fix     # Auto-fix issues
bun run lint:fix         # Run both ESLint + Prettier
```

### TypeScript Configuration

Use the centralized TypeScript configs:

**`tsconfig.json`:**
```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**What's Included:**
- `target: ES2022` - Modern JavaScript features
- `experimentalDecorators: true` - Required for Ignis decorators
- `emitDecoratorMetadata: true` - Metadata reflection for DI
- `strict: true` - Strict type checking with selective relaxations
- `skipLibCheck: true` - Faster compilation

See [`@venizia/dev-configs` documentation](../references/src-details/dev-configs.md) for full details.

## Directory Structure

### Component Organization

```
src/components/[feature]/
├── index.ts              # Barrel exports
├── component.ts          # IoC binding setup
├── controller.ts         # Route handlers
└── common/
    ├── index.ts          # Barrel exports
    ├── keys.ts           # Binding key constants
    ├── types.ts          # Interfaces and types
    └── rest-paths.ts     # Route path constants
```

### Complex Component (with multiple features)

```
src/components/auth/
├── index.ts
├── authenticate/
│   ├── index.ts
│   ├── component.ts
│   ├── common/
│   ├── controllers/
│   ├── services/
│   └── strategies/
└── models/
    ├── entities/         # Database models
    └── requests/         # Request schemas
```

### Barrel Exports

Every folder should have an `index.ts` that re-exports its contents:

```typescript
// components/health-check/index.ts
export * from './common';
export * from './component';
export * from './controller';

// components/health-check/common/index.ts
export * from './keys';
export * from './rest-paths';
export * from './types';
```

## Naming Conventions

### Class Names

| Type | Pattern | Example |
|------|---------|---------|
| Components | `[Feature]Component` | `HealthCheckComponent`, `AuthComponent` |
| Controllers | `[Feature]Controller` | `UserController`, `AuthController` |
| Services | `[Feature]Service` | `JWTTokenService`, `PaymentService` |
| Repositories | `[Feature]Repository` | `UserRepository`, `OrderRepository` |
| Strategies | `[Feature]Strategy` | `JWTAuthenticationStrategy` |
| Factories | `[Feature]Factory` | `UIProviderFactory` |

### File Names

Both styles are acceptable: `[type].ts` or `[name].[type].ts`

| Type | Single File | Multiple Files |
|------|-------------|----------------|
| Components | `component.ts` | `auth.component.ts` |
| Controllers | `controller.ts` | `user.controller.ts` |
| Services | `service.ts` | `jwt-token.service.ts` |
| Repositories | `repository.ts` | `user.repository.ts` |
| Types/Interfaces | `types.ts` | `user.types.ts` |
| Constants | `constants.ts` | `keys.ts`, `rest-paths.ts` |
| Schemas | `schema.ts` | `sign-in.schema.ts` |

**Guidelines:**
- Use `[type].ts` when there's only one file of that type in the folder
- Use `[name].[type].ts` when there are multiple files of the same type
- Use kebab-case for multi-word names: `jwt-token.service.ts`

### Type and Interface Prefixes

```typescript
// Interfaces use 'I' prefix
interface IHealthCheckOptions {
  restOptions: { path: string };
}

interface IAuthService {
  signIn(context: Context): Promise<void>;
}

// Type aliases use 'T' prefix
type TSignInRequest = z.infer<typeof SignInRequestSchema>;
type TRouteContext = Context<Env, Path, Input>;

// Generic constraints
type TTableSchemaWithId = { id: PgColumn };
```

### Binding Keys

Use static class with `@app/[component]/[feature]` format:

```typescript
export class HealthCheckBindingKeys {
  static readonly HEALTH_CHECK_OPTIONS = '@app/health-check/options';
}

export class SocketIOBindingKeys {
  static readonly SOCKET_IO_INSTANCE = '@app/socket-io/instance';
  static readonly SERVER_OPTIONS = '@app/socket-io/server-options';
}
```

## Private Field Naming Convention

Use underscore prefix (`_`) for private and protected class fields to distinguish them from public fields and method parameters.

```typescript
class MyRepository extends BaseRepository {
  // Private fields with underscore prefix
  private _dataSource: IDataSource;
  private _entity: BaseEntity;
  private _hiddenProperties: Set<string> | null = null;

  // Protected fields also use underscore prefix
  protected _schemaFactory?: ReturnType<typeof createSchemaFactory>;

  constructor(dataSource: IDataSource) {
    // 'dataSource' (param) vs '_dataSource' (field)
    this._dataSource = dataSource;
  }
}
```

**Benefits:**
- Clear distinction between fields and parameters
- Avoids naming conflicts in constructors
- Consistent with TypeScript community conventions

## Sentinel Value Pattern for Caching

Use `null` to distinguish "not computed" from "computed as undefined" for lazy-initialized cached values.

```typescript
class Repository {
  // null = not computed yet, undefined = computed but no value
  private _visibleProperties: Record<string, any> | null | undefined = null;

  get visibleProperties(): Record<string, any> | undefined {
    if (this._visibleProperties !== null) {
      return this._visibleProperties;
    }
    // Compute once and cache (may be undefined)
    this._visibleProperties = this.computeVisibleProperties();
    return this._visibleProperties;
  }
}
```

**Why not just `undefined`?**
- `undefined` can be a valid computed result
- `null` clearly indicates "never computed"
- Prevents redundant re-computation

## Type Safety

To ensure long-term maintainability and catch errors at compile-time, Ignis enforces strict type safety.

### Avoid `any` and `unknown`

**Never use `any` or `unknown` as much as possible.** You must specify clear, descriptive types for all variables, parameters, and return values.

-   **`any`**: Bypasses all type checking and leads to "runtime surprises". It is strictly discouraged.
-   **`unknown`**: While safer than `any`, it still forces consumers to perform manual type checking. Prefer using generics or specific interfaces.

**Why?**
- **Maintenance**: Developers reading your code in the future will know exactly what the data structure is.
- **Refactoring**: Changing an interface automatically highlights all broken code across the monorepo.
- **Documentation**: Types act as a self-documenting contract for your APIs and services.

## Type Definitions

### Explicit Return Types
Always define explicit return types for **public methods** and **API handlers**.

**Why?**
- **Compiler Performance:** Speeds up TypeScript type checking in large projects.
- **Safety:** Prevents accidental exposure of internal types or sensitive data.

```typescript
// ✅ GOOD
public async findUser(id: string): Promise<User | null> { ... }

// ❌ BAD (Implicit inference)
public async findUser(id: string) { ... }
```

## Type Inference Patterns

### Zod Schema to Type

```typescript
// Define schema
export const SignInRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Infer type from schema
export type TSignInRequest = z.infer<typeof SignInRequestSchema>;
```

### Const Assertion for Literal Types

```typescript
const RouteConfigs = {
  GET_USERS: { method: 'GET', path: '/users' },
  GET_USER_BY_ID: { method: 'GET', path: '/users/:id' },
} as const;

// Type is now narrowed to literal values
type RouteKey = keyof typeof RouteConfigs; // 'GET_USERS' | 'GET_USER_BY_ID'
```

### Generic Type Constraints

```typescript
export class DefaultCRUDRepository<
  Schema extends TTableSchemaWithId = TTableSchemaWithId
> {
  // Schema is constrained to have an 'id' column
}

export interface IAuthService<
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
> {
  signIn(context: Context, opts: SIRQ): Promise<SIRS>;
}
```

### Method Overloading for Conditional Returns

Use TypeScript method overloads when return types depend on input options:

```typescript
class Repository<T, R> {
  // Overload 1: shouldReturn: false → data is null
  create(opts: { data: T; options: { shouldReturn: false } }): Promise<{ count: number; data: null }>;
  // Overload 2: shouldReturn: true (default) → data is R
  create(opts: { data: T; options?: { shouldReturn?: true } }): Promise<{ count: number; data: R }>;
  // Implementation signature
  create(opts: { data: T; options?: { shouldReturn?: boolean } }): Promise<{ count: number; data: R | null }> {
    // implementation
  }
}

// Usage
const result1 = await repo.create({ data: user, options: { shouldReturn: false } });
// result1.data is typed as null

const result2 = await repo.create({ data: user });
// result2.data is typed as R (the entity type)
```

**When to use:**
- Return type varies based on boolean flag
- API with optional "return data" behavior
- Methods with conditional processing

## Module Exports

### Prefer Named Exports
Avoid `export default` except for configuration files (e.g., `eslint.config.mjs`) or lazy-loaded components. Use named exports for all classes, functions, and constants.

**Why?**
- **Refactoring:** Renaming a symbol automatically updates imports across the monorepo.
- **Consistency:** Enforces consistent naming across all files importing the module.

```typescript
// ✅ GOOD
export class UserController { ... }

// ❌ BAD
export default class UserController { ... }
```

## Function Signatures

### The Options Object Pattern
Prefer using a single object parameter (`opts`) over multiple positional arguments, especially for constructors and public methods with more than 2 arguments.

**Why?**
- **Extensibility:** You can add new properties without breaking existing calls.
- **Readability:** Named keys act as documentation at the call site.

```typescript
// ✅ GOOD
class UserService {
  createUser(opts: { name: string; email: string; role?: string }) { ... }
}
// Usage: service.createUser({ name: 'John', email: 'john@example.com' });

// ❌ BAD
class UserService {
  createUser(name: string, email: string, role?: string) { ... }
}
// Usage: service.createUser('John', 'john@example.com');
```

## Function Naming Conventions

Use consistent prefixes based on function purpose:

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `generate*` | Create column definitions / schemas | `generateIdColumnDefs()`, `generateTzColumnDefs()` |
| `build*` | Construct complex objects | `buildPrimitiveCondition()`, `buildJsonOrderBy()` |
| `to*` | Convert/transform data | `toCamel()`, `toBoolean()`, `toStringDecimal()` |
| `is*` | Boolean validation/check | `isWeekday()`, `isInt()`, `isFloat()`, `isPromiseLike()` |
| `extract*` | Pull out specific parts | `extractTimestamp()`, `extractWorkerId()`, `extractSequence()` |
| `enrich*` | Enhance with additional data | `enrichUserAudit()`, `enrichWithMetadata()` |
| `get*` | Retrieve/fetch data | `getSchema()`, `getConnector()`, `getError()` |
| `resolve*` | Determine/compute value | `resolveValue()`, `resolvePath()` |

**Examples:**

```typescript
// Generators - create schema definitions
const idCols = generateIdColumnDefs({ id: { dataType: 'string' } });
const tzCols = generateTzColumnDefs();

// Builders - construct complex query objects
const condition = buildPrimitiveCondition(column, operator, value);
const orderBy = buildJsonOrderBy(schema, path, direction);

// Converters - transform data types
const camelCase = toCamel('snake_case');
const bool = toBoolean('true');
const decimal = toStringDecimal(123.456, 2);

// Validators - boolean checks
if (isWeekday(date)) { /* ... */ }
if (isInt(value)) { /* ... */ }
if (isPromiseLike(result)) { /* ... */ }

// Extractors - pull specific data
const timestamp = extractTimestamp(snowflakeId);
const workerId = extractWorkerId(snowflakeId);
```

## Route Definition Patterns

Ignis supports three methods for defining routes. Choose based on your needs:

### Method 1: Config-Driven Routes

Define route configurations as constants with UPPER_CASE names:

```typescript
// common/rest-paths.ts
export class UserRestPaths {
  static readonly ROOT = '/';
  static readonly BY_ID = '/:id';
  static readonly PROFILE = '/profile';
}

// common/route-configs.ts
export const RouteConfigs = {
  GET_USERS: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.ROOT,
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Ok]: UserListSchema,
    }),
  },
  GET_USER_BY_ID: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.BY_ID,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Ok]: UserSchema,
      [HTTP.ResultCodes.RS_4.NotFound]: ErrorSchema,
    }),
  },
} as const;
```

### Method 2: Using `@api` Decorator

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {

  @api({ configs: RouteConfigs.GET_USERS })
  list(context: TRouteContext<typeof RouteConfigs.GET_USERS>) {
    return context.json({ users: [] }, HTTP.ResultCodes.RS_2.Ok);
  }

  @api({ configs: RouteConfigs.GET_USER_BY_ID })
  getById(context: TRouteContext<typeof RouteConfigs.GET_USER_BY_ID>) {
    const { id } = context.req.valid('param');
    return context.json({ id, name: 'User' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### Method 3: Using `bindRoute` (Programmatic)

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseController {
  constructor() {
    super({ scope: HealthCheckController.name });

    this.bindRoute({ configs: RouteConfigs.GET_HEALTH }).to({
      handler: context => context.json({ status: 'ok' }),
    });
  }
}
```

### Method 4: Using `defineRoute` (Inline)

```typescript
@controller({ path: '/health' })
export class HealthCheckController extends BaseController {
  constructor() {
    super({ scope: HealthCheckController.name });

    this.defineRoute({
      configs: RouteConfigs.POST_PING,
      handler: context => {
        const { message } = context.req.valid('json');
        return context.json({ echo: message }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

### OpenAPI Schema Integration

Use Zod with `.openapi()` for automatic documentation:

```typescript
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
}).openapi({
  description: 'Create user request body',
  example: { email: 'user@example.com', name: 'John Doe' },
});

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
}).openapi({
  description: 'User response',
});
```

## Constants Pattern

**Prefer static classes over enums** for better tree-shaking and extensibility.

### Basic Constants

```typescript
export class Authentication {
  static readonly STRATEGY_BASIC = 'basic';
  static readonly STRATEGY_JWT = 'jwt';
  static readonly TYPE_BEARER = 'Bearer';
}

export class HealthCheckRestPaths {
  static readonly ROOT = '/';
  static readonly PING = '/ping';
  static readonly METRICS = '/metrics';
}
```

### Typed Constants with Validation

For constants that need type extraction and runtime validation, use this pattern:

```typescript
import { TConstValue } from '@venizia/ignis-helpers';

export class DocumentUITypes {
  // 1. Define static readonly values
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';

  // 2. Create a Set for O(1) validation lookup
  static readonly SCHEME_SET = new Set([this.SWAGGER, this.SCALAR]);

  // 3. Validation helper method
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

// 4. Extract union type from class values
export type TDocumentUIType = TConstValue<typeof DocumentUITypes>;
// Result: 'swagger' | 'scalar'
```

**Full Example with Usage:**

```typescript
import { TConstValue } from '@venizia/ignis-helpers';

export class UserStatuses {
  static readonly ACTIVE = 'active';
  static readonly INACTIVE = 'inactive';
  static readonly PENDING = 'pending';
  static readonly BANNED = 'banned';

  static readonly SCHEME_SET = new Set([
    this.ACTIVE,
    this.INACTIVE,
    this.PENDING,
    this.BANNED,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }

  // Optional: get all values as array
  static values(): string[] {
    return [...this.SCHEME_SET];
  }
}

// Type-safe union type
export type TUserStatus = TConstValue<typeof UserStatuses>;
// Result: 'active' | 'inactive' | 'pending' | 'banned'

// Usage in interfaces
interface IUser {
  id: string;
  status: TUserStatus; // Type-safe!
}

// Usage with validation
function updateUserStatus(userId: string, status: string) {
  if (!UserStatuses.isValid(status)) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `Invalid status: ${status}. Valid: ${UserStatuses.values().join(', ')}`,
    });
  }
  // status is validated at runtime
}
```

### Enum vs Static Class Comparison

| Aspect | Static Class | TypeScript Enum |
|--------|--------------|-----------------|
| Tree-shaking | Full support | Partial (IIFE blocks it) |
| Bundle size | Minimal | Larger (IIFE wrapper) |
| Runtime validation | O(1) with `Set` | O(n) with `Object.values()` |
| Type extraction | `TConstValue<typeof X>` → values | `keyof typeof X` → keys (not values!) |
| Add methods | Yes | Not possible |
| Compiled output | Clean class | IIFE wrapper |

**Compiled JavaScript:**

```typescript
// Enum compiles to IIFE (not tree-shakable)
var UserStatus;
(function (UserStatus) {
  UserStatus["ACTIVE"] = "active";
})(UserStatus || (UserStatus = {}));

// Static class compiles cleanly
class UserStatuses { }
UserStatuses.ACTIVE = 'active';
```

**Type Extraction Difference:**

```typescript
// Enum - extracts KEYS
type T = keyof typeof UserStatus; // 'ACTIVE' | 'INACTIVE'

// Static Class - extracts VALUES
type T = TConstValue<typeof UserStatuses>; // 'active' | 'inactive'
```

**When to use `const enum`:** Only for numeric flags with no iteration needed (values are inlined, zero runtime). But doesn't work with `--isolatedModules`.

**Verdict:** Use Static Class for 90% of cases - better tree-shaking, easy validation, type-safe values, extensible with methods.

## Configuration Patterns

### Default Options

Every configurable class should define `DEFAULT_OPTIONS`:

```typescript
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
};

const DEFAULT_SERVER_OPTIONS: Partial<IServerOptions> = {
  identifier: 'SOCKET_IO_SERVER',
  path: '/io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
};
```

### Option Merging

```typescript
// In component constructor or binding
const extraOptions = this.application.get<Partial<IServerOptions>>({
  key: BindingKeys.SERVER_OPTIONS,
  isOptional: true,
}) ?? {};

this.options = Object.assign({}, DEFAULT_OPTIONS, extraOptions);
```

### Constructor Validation

Validate required options in the constructor:

```typescript
constructor(options: IJWTTokenServiceOptions) {
  super({ scope: JWTTokenService.name });

  if (!options.jwtSecret) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[JWTTokenService] Invalid jwtSecret',
    });
  }

  if (!options.applicationSecret) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: '[JWTTokenService] Invalid applicationSecret',
    });
  }

  this.options = options;
}
```

## Environment Variables Management

Avoid using `process.env` directly in your business logic. Instead, use the `applicationEnvironment` helper and define your keys as constants. This ensures type safety and centralized management.

**Define Keys (`src/common/environments.ts`):**
```typescript
export class EnvironmentKeys {
  static readonly APP_ENV_STRIPE_KEY = 'APP_ENV_STRIPE_KEY';
  static readonly APP_ENV_MAX_RETRIES = 'APP_ENV_MAX_RETRIES';
}
```

**Usage:**
```typescript
import { applicationEnvironment } from '@venizia/ignis';
import { EnvironmentKeys } from '@/common/environments';

// Correct usage
const stripeKey = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_STRIPE_KEY);
const retries = applicationEnvironment.get<number>(EnvironmentKeys.APP_ENV_MAX_RETRIES);
```

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

## Standardized Error Handling

Use the `getError` helper and `HTTP` constants to throw consistent, formatted exceptions that the framework's error handler can process correctly.

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

### HTTP Status Code Categories

| Category | Constant | Use Case |
|----------|----------|----------|
| Success | `HTTP.ResultCodes.RS_2.Ok` | Successful response |
| Created | `HTTP.ResultCodes.RS_2.Created` | Resource created |
| Bad Request | `HTTP.ResultCodes.RS_4.BadRequest` | Invalid input |
| Unauthorized | `HTTP.ResultCodes.RS_4.Unauthorized` | Missing/invalid auth |
| Forbidden | `HTTP.ResultCodes.RS_4.Forbidden` | Insufficient permissions |
| Not Found | `HTTP.ResultCodes.RS_4.NotFound` | Resource not found |
| Internal Error | `HTTP.ResultCodes.RS_5.InternalServerError` | Server errors |

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

## Scope Naming

Every class extending a base class should set its scope using `ClassName.name`:

```typescript
export class JWTTokenService extends BaseService {
  constructor() {
    super({ scope: JWTTokenService.name });
  }
}

export class UserController extends BaseController {
  constructor() {
    super({ scope: UserController.name });
  }
}
```

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

## Performance Logging Pattern

Use `performance.now()` for timing critical operations:

```typescript
const t = performance.now();

// ... operation to measure ...

this.logger.info('[methodName] DONE | Took: %s (ms)', performance.now() - t);
```

**With the helper utility:**

```typescript
import { executeWithPerformanceMeasure } from '@venizia/ignis';

await executeWithPerformanceMeasure({
  logger: this.logger,
  scope: 'DataSync',
  description: 'Sync user records',
  task: async () => {
    await syncAllUsers();
  },
});
// Logs: [DataSync] Sync user records | Took: 1234.56 (ms)
```

## Advanced Patterns

### Mixin Pattern

Create reusable class extensions without deep inheritance:

```typescript
import { TMixinTarget } from '@venizia/ignis';

export const LoggableMixin = <BaseClass extends TMixinTarget<Base>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    protected logger = LoggerFactory.getLogger(this.constructor.name);

    log(message: string): void {
      this.logger.info(message);
    }
  };
};

// Usage
class MyService extends LoggableMixin(BaseService) {
  doWork(): void {
    this.log('Work started');  // Method from mixin
  }
}
```

### Factory Pattern with Dynamic Class

Generate classes dynamically with configuration:

```typescript
class ControllerFactory {
  static defineCrudController<Schema extends TTableSchemaWithId>(
    opts: ICrudControllerOptions<Schema>,
  ) {
    return class extends BaseController {
      constructor(repository: AbstractRepository<Schema>) {
        super({ scope: opts.controller.name });
        this.repository = repository;
        this.setupRoutes();
      }

      private setupRoutes(): void {
        // Dynamically bind CRUD routes
      }
    };
  }
}

// Usage
const UserCrudController = ControllerFactory.defineCrudController({
  controller: { name: 'UserController', basePath: '/users' },
  repository: { name: UserRepository.name },
  entity: () => User,
});

@controller({ path: '/users' })
export class UserController extends UserCrudController {
  // Additional custom routes
}
```

### Value Resolver Pattern

Support multiple input types that resolve to a single value:

```typescript
export type TValueOrResolver<T> = T | TResolver<T> | TConstructor<T>;

export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;  // Direct value
  }
  if (isClassConstructor(valueOrResolver)) {
    return valueOrResolver as T;  // Class constructor (return as-is)
  }
  return (valueOrResolver as TResolver<T>)();  // Function resolver
};

// Usage
interface IOptions {
  entity: TValueOrResolver<typeof User>;
}

// All valid:
const opts1: IOptions = { entity: User };           // Direct class
const opts2: IOptions = { entity: () => User };     // Resolver function
```

## Summary Table

| Aspect | Standard |
|--------|----------|
| Interface prefix | `I` (e.g., `IUserService`) |
| Type alias prefix | `T` (e.g., `TUserRequest`) |
| Class naming | PascalCase with suffix (e.g., `UserController`) |
| File naming | kebab-case (e.g., `user.controller.ts`) |
| Private fields | Underscore prefix (`_dataSource`) |
| Binding keys | `@app/[component]/[feature]` |
| Constants | Static readonly class (not enums) |
| Barrel exports | `index.ts` at every folder level |
| Error format | `[ClassName][method] Message` |
| Logging format | `[method] Message \| Key: %s` |
| Default options | `DEFAULT_OPTIONS` constant |
| Type safety | No `any` or `unknown` allowed |
| Scope naming | `ClassName.name` |
| Arguments | Options object (`opts`) |
| Exports | Named exports only |
| Return types | Explicitly defined |
| Control flow | Always use braces (`{}`) |
| Switch statements | Braces + default case required |
| Imports | Node → Third-party → Internal → Relative |
| Function naming | `generate*`, `build*`, `to*`, `is*`, `extract*` |