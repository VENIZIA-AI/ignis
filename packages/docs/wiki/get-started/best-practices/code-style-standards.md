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

See [`@venizia/dev-configs` documentation](../../references/src-details/dev-configs.md) for full details.

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

## Route Definition Patterns

Ignis supports three methods for defining routes. Choose based on your needs:

### Method 1: Config-Driven Routes

Define route configurations as constants:

```typescript
// common/rest-paths.ts
export class UserRestPaths {
  static readonly ROOT = '/';
  static readonly BY_ID = '/:id';
  static readonly PROFILE = '/profile';
}

// common/route-configs.ts
export const ROUTE_CONFIGS = {
  [UserRestPaths.ROOT]: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.ROOT,
    responses: jsonResponse({
      [HTTP.ResultCodes.RS_2.Ok]: UserListSchema,
    }),
  },
  [UserRestPaths.BY_ID]: {
    method: HTTP.Methods.GET,
    path: UserRestPaths.BY_ID,
    request: {
      params: z.object({ id: z.string().uuid() }),
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

  @api({ configs: ROUTE_CONFIGS[UserRestPaths.ROOT] })
  list(context: TRouteContext<typeof ROUTE_CONFIGS[typeof UserRestPaths.ROOT]>) {
    return context.json({ users: [] }, HTTP.ResultCodes.RS_2.Ok);
  }

  @api({ configs: ROUTE_CONFIGS[UserRestPaths.BY_ID] })
  getById(context: TRouteContext<typeof ROUTE_CONFIGS[typeof UserRestPaths.BY_ID]>) {
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

    this.bindRoute({ configs: ROUTE_CONFIGS['/'] }).to({
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
      configs: ROUTE_CONFIGS['/ping'],
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
const ROUTE_CONFIGS = {
  '/users': { method: 'GET', path: '/users' },
  '/users/:id': { method: 'GET', path: '/users/:id' },
} as const;

// Type is now narrowed to literal values
type RouteKey = keyof typeof ROUTE_CONFIGS; // '/users' | '/users/:id'
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

## Summary Table

| Aspect | Standard |
|--------|----------|
| Interface prefix | `I` (e.g., `IUserService`) |
| Type alias prefix | `T` (e.g., `TUserRequest`) |
| Class naming | PascalCase with suffix (e.g., `UserController`) |
| File naming | kebab-case (e.g., `user.controller.ts`) |
| Binding keys | `@app/[component]/[feature]` |
| Constants | Static readonly class (not enums) |
| Barrel exports | `index.ts` at every folder level |
| Error format | `[ClassName][method] Message` |
| Logging format | `[method] Message \| Key: %s` |
| Default options | `DEFAULT_OPTIONS` constant |
| Scope naming | `ClassName.name` |

