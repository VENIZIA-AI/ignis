# Naming Conventions

Consistent naming improves code readability and maintainability.

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

## Class Names

| Type | Pattern | Example |
|------|---------|---------|
| Components | `[Feature]Component` | `HealthCheckComponent`, `AuthComponent` |
| Controllers | `[Feature]Controller` | `UserController`, `AuthController` |
| Services | `[Feature]Service` | `JWTTokenService`, `PaymentService` |
| Repositories | `[Feature]Repository` | `UserRepository`, `OrderRepository` |
| Strategies | `[Feature]Strategy` | `JWTAuthenticationStrategy` |
| Factories | `[Feature]Factory` | `UIProviderFactory` |

## File Names

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

## Type and Interface Prefixes

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

## Binding Keys

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

## Private Field Naming

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

## See Also

- [Type Safety](./type-safety) - Type naming and constraints
- [Function Patterns](./function-patterns) - Function naming conventions
- [Constants & Configuration](./constants-configuration) - Constant naming
