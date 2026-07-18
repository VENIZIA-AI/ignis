# Function Patterns

Consistent function patterns improve code readability and maintainability.

## Module Exports

### Prefer Named Exports

Avoid `export default` except for configuration files (e.g., `eslint.config.mjs`) or lazy-loaded components. Use named exports for all classes, functions, and constants.

**Why?**
- **Refactoring:** Renaming a symbol automatically updates imports across the monorepo
- **Consistency:** Enforces consistent naming across all files importing the module

```typescript
// ✅ GOOD
export class UserController { }
export const createUser = () => { };
export const DEFAULT_OPTIONS = { };

// ❌ BAD
export default class UserController { }
export function createUser() { }   // arrow functions only, never `function`
```

## The Options Object Pattern

Prefer using a single object parameter (`opts`) over multiple positional arguments, especially for constructors and public methods with more than 2 arguments.

**Why?**
- **Extensibility:** You can add new properties without breaking existing calls
- **Readability:** Named keys act as documentation at the call site

```typescript
// ✅ GOOD
class UserService {
  createUser(opts: { name: string; email: string; role?: string }) {
    // ...
  }
}
// Usage: service.createUser({ name: 'John', email: 'john@example.com' });

// ❌ BAD
class UserService {
  createUser(name: string, email: string, role?: string) {
    // ...
  }
}
// Usage: service.createUser('John', 'john@example.com');
```

## Function Naming Conventions

Use consistent prefixes based on function purpose:

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `generate*` | Create column definitions / schemas | `generateIdColumnDefs()`, `generateTzColumnDefs()` |
| `build*` | Construct complex objects | `buildValueCondition()`, `buildJsonOrderBy()` |
| `to*` | Convert/transform data | `toCamel()`, `toBoolean()` |
| `is*` | Boolean validation/check | `isWeekday()`, `isInt()`, `isFloat()`, `isPromiseLike()` |
| `extract*` | Pull out specific parts | `extractTimestamp()`, `extractWorkerId()`, `extractSequence()` |
| `enrich*` | Enhance with additional data | `enrichUserAudit()`, `enrichWithMetadata()` |
| `get*` | Retrieve/fetch data | `getSchema()`, `getConnector()`, `getError()` |
| `resolve*` | Determine/compute value | `resolveValue()`, `resolveClass()` |

**Examples:**

```typescript
// Generators - create schema definitions
const idCols = generateIdColumnDefs({ id: { dataType: 'string' } });
const tzCols = generateTzColumnDefs();

// Builders - construct complex query objects
const condition = buildValueCondition(column, value);
const orderBy = buildJsonOrderBy(schema, path, direction);

// Converters - transform data types
const camelCase = toCamel('snake_case');
const bool = toBoolean('true');

// Validators - boolean checks
if (isWeekday(date)) { /* ... */ }
if (isInt(value)) { /* ... */ }
if (isPromiseLike(result)) { /* ... */ }

// Extractors - pull specific data
const timestamp = extractTimestamp(snowflakeId);
const workerId = extractWorkerId(snowflakeId);
```

## Scope Naming

Every class extending a base class should set its scope using `ClassName.name`:

```typescript
export class PaymentService extends BaseService {
  constructor() {
    super({ scope: PaymentService.name });
  }
}

export class UserController extends BaseRestController {
  constructor() {
    super({ scope: UserController.name, path: '/users' });
  }
}
```

## Performance Logging Pattern

Use `performance.now()` for timing critical operations with method-scoped logging:

```typescript
async syncData() {
  const t = performance.now();
  this.logger.for('syncData').info('START | Syncing data...');

  // ... operation to measure ...

  this.logger.for('syncData').info('DONE | Took: %s (ms)', performance.now() - t);
}
```

**With the helper utility:**

```typescript
import { executeWithPerformanceMeasure } from '@venizia/ignis-helpers';

await executeWithPerformanceMeasure({
  logger: this.logger,
  level: 'info',              // default: 'debug'
  scope: 'DataSync',
  description: 'Sync user records',
  task: async () => {
    await syncAllUsers();
  },
});
// Logs: [DataSync] DONE | Sync user records | Took: 1234.56 (ms)
```

**Method-scoped logging pattern:**

Any class extending `BaseHelper` (services, controllers, repositories, helpers) already has
`this.logger`. Acquire one standalone with `ApplicationLogger.get(...)` and always annotate
`ILogger` - never a concrete provider class.

```typescript
import { ApplicationLogger, ILogger } from '@venizia/ignis-helpers';

class UserService {
  private logger: ILogger = ApplicationLogger.get('UserService');

  async createUser(data: TCreateUserRequest) {
    // .for() returns a method-scoped child logger
    this.logger.for('createUser').info('Creating user: %j', data);
    // Output: [UserService-createUser] Creating user: {...}

    try {
      const { data: user } = await this.userRepository.create({ data });
      this.logger.for('createUser').info('User created: %s', user.id);
      return user;
    } catch (error) {
      // %s, not %j - `message` and `stack` are non-enumerable, so %j drops them
      this.logger.for('createUser').error('Failed: %s', error);
      throw error;
    }
  }
}
```

Levels are exactly five, each a direct method: `debug`, `info`, `warn`, `error`, `emerg`.

## See Also

- [Naming Conventions](./naming-conventions) - Class and file naming
- [Type Safety](./type-safety) - Typed function signatures
- [Route Definitions](./route-definitions) - Controller methods
