# Constants & Configuration

Best practices for defining constants and managing configuration.

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

### Full Example with Usage

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

## Enum vs Static Class Comparison

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

Avoid using `process.env` directly in your business logic. Instead, use the `applicationEnvironment` helper and define your keys as constants.

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

## See Also

- [Naming Conventions](./naming-conventions) - Constant naming
- [Type Safety](./type-safety) - Type extraction patterns
- [Configuration Reference](../../references/configuration/) - Environment variables
