# Type Safety

Strict type safety ensures long-term maintainability and catches errors at compile-time.

## Avoid `any` and `unknown`

**Never use `any` or `unknown` as much as possible.** You must specify clear, descriptive types for all variables, parameters, and return values.

| Type | Problem | Solution |
|------|---------|----------|
| `any` | Bypasses all type checking | Use specific types or generics |
| `unknown` | Forces manual type checking | Use interfaces or type guards |

**Why?**
- **Maintenance**: Developers reading your code will know exactly what the data structure is
- **Refactoring**: Changing an interface automatically highlights all broken code
- **Documentation**: Types act as a self-documenting contract

```typescript
// ❌ BAD
const data: any = await fetchData();
const result: unknown = processData();

// ✅ GOOD
const data: TUserResponse = await fetchData();
const result: TProcessResult = processData();
```

## Explicit Return Types

Always define explicit return types for **public methods** and **API handlers**.

**Why?**
- **Compiler Performance:** Speeds up TypeScript type checking in large projects
- **Safety:** Prevents accidental exposure of internal types or sensitive data

```typescript
// ✅ GOOD
public async findUser(id: string): Promise<User | null> {
  // ...
}

// ❌ BAD (Implicit inference)
public async findUser(id: string) {
  // Return type is inferred - can change unexpectedly
}
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

## Type Guard Patterns

```typescript
// Type guard function
function isUser(obj: unknown): obj is TUser {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'email' in obj
  );
}

// Usage
const data = await fetchData();
if (isUser(data)) {
  // data is now typed as TUser
  console.log(data.email);
}
```

## Discriminated Unions

```typescript
type TResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function processResult<T>(result: TResult<T>) {
  if (result.success) {
    // TypeScript knows result.data exists
    return result.data;
  } else {
    // TypeScript knows result.error exists
    throw new Error(result.error);
  }
}
```

## See Also

- [Naming Conventions](./naming-conventions) - Type naming prefixes
- [Function Patterns](./function-patterns) - Typed function signatures
- [Advanced Patterns](./advanced-patterns) - Generic patterns
