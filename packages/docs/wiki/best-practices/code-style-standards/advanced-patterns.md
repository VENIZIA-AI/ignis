# Advanced Patterns

Advanced TypeScript patterns used throughout the Ignis framework.

## Mixin Pattern

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

### Multiple Mixins

```typescript
class MyRepository extends LoggableMixin(CacheableMixin(BaseRepository)) {
  // Has both logging and caching capabilities
}
```

### Typed Mixin with Constraints

```typescript
type TWithId = { id: string };

export const TimestampMixin = <
  BaseClass extends TMixinTarget<TWithId>
>(baseClass: BaseClass) => {
  return class extends baseClass {
    createdAt: Date = new Date();
    updatedAt: Date = new Date();

    touch(): void {
      this.updatedAt = new Date();
    }
  };
};
```

## Factory Pattern with Dynamic Class

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
        this.defineRoute({
          configs: { method: 'get', path: '/' },
          handler: (c) => this.list(c),
        });
        this.defineRoute({
          configs: { method: 'get', path: '/:id' },
          handler: (c) => this.getById(c),
        });
        // ... more routes
      }

      async list(c: Context) {
        const data = await this.repository.find({});
        return c.json(data);
      }

      async getById(c: Context) {
        const { id } = c.req.param();
        const data = await this.repository.findById({ id });
        return c.json(data);
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

## Value Resolver Pattern

Support multiple input types that resolve to a single value:

```typescript
// Type definitions
export type TResolver<T> = () => T;
export type TConstructor<T> = new (...args: any[]) => T;
export type TValueOrResolver<T> = T | TResolver<T> | TConstructor<T>;

// Resolver function
export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;  // Direct value
  }
  if (isClassConstructor(valueOrResolver)) {
    return valueOrResolver as T;  // Class constructor (return as-is)
  }
  return (valueOrResolver as TResolver<T>)();  // Function resolver
};

// Helper to detect class constructors
function isClassConstructor(fn: Function): boolean {
  return fn.toString().startsWith('class ');
}
```

### Usage

```typescript
interface IOptions {
  entity: TValueOrResolver<typeof User>;
}

// All valid:
const opts1: IOptions = { entity: User };           // Direct class
const opts2: IOptions = { entity: () => User };     // Resolver function (for lazy loading)

// In consumer code
const EntityClass = resolveValue(opts.entity);
const instance = new EntityClass();
```

### Why Use Value Resolvers?

1. **Circular Dependency Prevention**: Lazy loading via resolver functions breaks cycles
2. **Lazy Initialization**: Defer expensive imports until needed
3. **Testing**: Easy to swap implementations via resolvers
4. **Flexibility**: Single API accepts multiple input types

## Builder Pattern

For constructing complex objects step-by-step:

```typescript
class QueryBuilder<T> {
  private _where: Record<string, any> = {};
  private _orderBy: string[] = [];
  private _limit?: number;
  private _offset?: number;

  where(conditions: Record<string, any>): this {
    this._where = { ...this._where, ...conditions };
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this._orderBy.push(`${field} ${direction.toUpperCase()}`);
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  build(): TQueryOptions {
    return {
      where: this._where,
      order: this._orderBy,
      limit: this._limit,
      offset: this._offset,
    };
  }
}

// Usage
const query = new QueryBuilder()
  .where({ status: 'active' })
  .orderBy('createdAt', 'desc')
  .limit(10)
  .offset(0)
  .build();
```

## Registry Pattern

Centralized registration of components:

```typescript
class StrategyRegistry<T> {
  private strategies = new Map<string, T>();

  register(name: string, strategy: T): void {
    if (this.strategies.has(name)) {
      throw new Error(`Strategy '${name}' already registered`);
    }
    this.strategies.set(name, strategy);
  }

  get(name: string): T {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Strategy '${name}' not found`);
    }
    return strategy;
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  all(): Map<string, T> {
    return new Map(this.strategies);
  }
}

// Usage
const authRegistry = new StrategyRegistry<IAuthStrategy>();
authRegistry.register('jwt', new JWTStrategy());
authRegistry.register('basic', new BasicStrategy());

const strategy = authRegistry.get('jwt');
```

## See Also

- [Type Safety](./type-safety) - Generic type patterns
- [Repositories Reference](../../references/base/repositories/) - Mixin usage
- [Architectural Patterns](../architectural-patterns) - High-level patterns
