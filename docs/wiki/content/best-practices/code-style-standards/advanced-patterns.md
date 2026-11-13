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
class CrudControllerFactory extends BaseHelper {
  static crud<Repository extends TClass<IRepository>>(opts: ICrudControllerOptions<Repository>) {
    const { repository, routes } = opts;

    // The entity comes from @repository({ model }) on the repository class
    const model = MetadataRegistry.getInstance().getRepositoryBinding({ target: repository })?.model;
    const entityClass = isClass(model) ? model : model();
    const entityInstance = new entityClass();

    // Derive request/response schemas + route configs from the entity; only listed routes get one
    const definitions = RouteConfigResolver.defineControllerRouteConfigs({
      idType: entityInstance.getIdType(),
      routes,
      schema: {
        select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
      },
    });

    return class extends PersistableCrudController {
      constructor(repositoryInstance: InstanceType<Repository>) {
        super({ scope: new.target.name, repository: repositoryInstance, definitions });
      }

      /** Registers each listed CRUD route handler, after the subclass's binding(). */
      override bindDefaultRoutes(): ValueOrPromise<void> {
        if (definitions.FIND) {
          this.defineRoute({
            configs: definitions.FIND,
            handler: async context => this.find({ context }),
          });
        }
        // ... the other routes, each guarded the same way
      }
    };
  }
}

// Usage - the entity comes from the repository's @repository({ model }), the path from @controller
const UserCrudController = CrudControllerFactory.build({
  repository: UserRepository,
  routes: CrudRoutes.READ,
});

@controller({ path: '/users' })
export class UserController extends UserCrudController {
  // Additional custom routes
}
```

> [!NOTE]
> The path is only on `@controller({ path })`. The generated routes register after the subclass's
> `binding()`, so a custom static path declared there wins over `/{id}`.

## Value Resolver Pattern

Support multiple input types that resolve to a single value:

<!-- docs-code: off -->
```typescript
export type TResolver<T> = (...args: any[]) => T;
export type TValueOrResolver<T> = T | TResolver<T>;
declare const isClass: <T>(target: any) => target is TClass<T>;
```
<!-- docs-code: on -->

`isClass` tells a class constructor from an arrow or regular function by testing the function's source against `/^class[\s{]/`, since every non-arrow function has a prototype. It is sound only on ES2020+ output.

```typescript
// A resolver is anything callable that is not a class - a class is a value, never a factory
export class ResolverUtility {
  private static isResolver<T>(
    valueOrResolver: TValueOrResolver<T>,
  ): valueOrResolver is TResolver<T> {
    return typeof valueOrResolver === 'function' && !isClass(valueOrResolver);
  }

  // ResolverUtility.resolveValue is declared in @venizia/ignis-inversion
  static resolveValue<T>(opts: { value: TValueOrResolver<T> }): T {
    const { value } = opts;

    // A class constructor is returned as-is; only a plain function is called
    return ResolverUtility.isResolver(value) ? value() : value;
  }
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
const EntityClass = ResolverUtility.resolveValue({ value: opts.entity });
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
  private _where: Record<string, unknown> = {};
  private _orderBy: string[] = [];
  private _limit?: number;
  private _offset?: number;

  where(conditions: Record<string, unknown>): this {
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
