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
export function createUser() { }
export const DEFAULT_OPTIONS = { };

// ❌ BAD
export default class UserController { }
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
import { executeWithPerformanceMeasure } from '@venizia/ignis';

await executeWithPerformanceMeasure({
  logger: this.logger.for('syncData'),
  scope: 'DataSync',
  description: 'Sync user records',
  task: async () => {
    await syncAllUsers();
  },
});
// Logs: [DataSync] Sync user records | Took: 1234.56 (ms)
```

**Method-scoped logging pattern:**

```typescript
class UserService {
  private logger = Logger.get('UserService');

  async createUser(data: CreateUserDto) {
    // Use .for() to add method context to all logs
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

## See Also

- [Naming Conventions](./naming-conventions) - Class and file naming
- [Type Safety](./type-safety) - Typed function signatures
- [Route Definitions](./route-definitions) - Controller methods
