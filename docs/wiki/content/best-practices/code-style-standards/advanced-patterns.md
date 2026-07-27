# Advanced Patterns

Advanced TypeScript patterns used throughout the IGNIS framework.

## Mixin Pattern

Create reusable class extensions without deep inheritance:

```typescript
import { ILogger, LoggerFactory, TMixinTarget } from '@venizia/ignis-helpers';

export const LoggableMixin = <BaseClass extends TMixinTarget<object>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    protected logger: ILogger = LoggerFactory.getLogger([this.constructor.name]);

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
class MyService extends LoggableMixin(CacheableMixin(BaseService)) {
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
class ControllerFactory extends BaseHelper {
  static defineCrudController<
    TEntity extends AbstractEntity = AbstractEntity,
    Routes extends ICustomizableRoutes = ICustomizableRoutes,
    // DataObject/PersistObject default to the entity's inferred select/insert shapes
    TDataObject extends object = TEntityDataObject<TEntity>,
    TPersistObject extends object = TEntityPersistObject<TEntity>,
  >(defOpts: ICrudControllerOptions<TEntity, Routes>) {
    const { controller, entity, routes } = defOpts;

    // `entity` accepts a class directly or a resolver function
    const entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new entityClass();

    // Derive request/response schemas + route configs from the entity instance
    const definitions = defineControllerRouteConfigs({
      idType: entityInstance.getIdType(),
      routes,
      schema: {
        select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
      },
    });

    return class extends PersistableCrudController<TEntity> {
      constructor(repository: AbstractRepository<TDataObject, TPersistObject>) {
        super({
          scope: controller.name,
          path: controller.basePath,
          repository,
          definitions,
        });
      }

      /** Registers all CRUD route handlers. */
      override binding(): ValueOrPromise<void> {
        this.defineRoute({
          configs: definitions.FIND,
          handler: async context => this.find({ context }),
        });
        this.defineRoute({
          configs: definitions.FIND_BY_ID,
          handler: async context => this.findById({ context }),
        });
        // ... more routes (count/findOne/create/updateById/deleteById/...)
      }
    };
  }
}

// Usage - types come from the entity, entity can be a class or a resolver
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

> [!NOTE]
> `controller.basePath` is required - `defineCrudController` throws via `getError` when it is
> missing or left at the internal `'unknown_path'` placeholder.

## Value Resolver Pattern

Support multiple input types that resolve to a single value:

```typescript
// Type definitions (from @venizia/ignis-helpers)
export type TResolver<T> = (...args: any[]) => T;
export type TValueOrResolver<T> = T | TResolver<T>;

// Resolver function
export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;  // Direct value
  }

  if (isClass(valueOrResolver)) {
    return valueOrResolver as T;  // Class constructor (return as-is)
  }

  return (valueOrResolver as TResolver<T>)();  // Function resolver
};

// isClass (declared in @venizia/ignis-inversion, re-exported by helpers) - distinguishes class
// constructors from arrow/regular functions by testing the SOURCE against /^class[\s{]/,
// since every non-arrow function has a prototype. Sound only on ES2020+ output.
export const isClass = <T>(target: any): target is TClass<T> => {
  if (typeof target !== 'function' || target.prototype === undefined) {
    return false;
  }

  return /^class[\s{]/.test(Function.prototype.toString.call(target));
};
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
  private _strategies = new Map<string, T>();

  register(name: string, strategy: T): void {
    if (this._strategies.has(name)) {
      throw getError({ message: `[register] Strategy '${name}' already registered` });
    }
    this._strategies.set(name, strategy);
  }

  get(name: string): T {
    const strategy = this._strategies.get(name);
    if (!strategy) {
      throw getError({ message: `[get] Strategy '${name}' not found` });
    }
    return strategy;
  }

  has(name: string): boolean {
    return this._strategies.has(name);
  }

  all(): Map<string, T> {
    return new Map(this._strategies);
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
- [Repositories Reference](../../references/base/repositories/) - Repository hierarchy
- [Architectural Patterns](../architectural-patterns) - High-level patterns
