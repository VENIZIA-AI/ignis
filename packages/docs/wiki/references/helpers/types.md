# Common Types

Utility types and helper functions for common TypeScript patterns.

## Value Resolution Types

Types for lazy/deferred value resolution patterns.

### TResolver / TAsyncResolver

```typescript
type TResolver<T> = (...args: any[]) => T;
type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
```

Function types that resolve to a value. `TAsyncResolver` supports async functions.

### TValueOrResolver / TValueOrAsyncResolver

```typescript
type TValueOrResolver<T> = T | TResolver<T>;
type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
```

Union types allowing either a direct value or a resolver function.

**Usage:**

```typescript
import { TValueOrAsyncResolver, resolveValueAsync } from '@venizia/ignis-helpers';

interface DatabaseConfig {
  host: string;
  port: number;
}

type ConfigOption = TValueOrAsyncResolver<DatabaseConfig>;

// Direct value
const config1: ConfigOption = { host: 'localhost', port: 5432 };

// Sync resolver
const config2: ConfigOption = () => ({ host: 'localhost', port: 5432 });

// Async resolver
const config3: ConfigOption = async () => {
  const config = await fetchConfigFromVault();
  return config;
};

// Resolve any of the above
const resolved = await resolveValueAsync(config3);
```

### resolveValue / resolveValueAsync

```typescript
const resolveValue: <T>(valueOrResolver: TValueOrResolver<T>) => T;
const resolveValueAsync: <T>(valueOrResolver: TValueOrAsyncResolver<T>) => Promise<T>;
```

Helper functions to resolve lazy values. They handle:
- **Direct values**: returned as-is
- **Class constructors**: returned as-is (not invoked)
- **Resolver functions**: invoked and result returned

## Nullable Types

### TNullable

```typescript
type TNullable<T> = T | undefined | null;
```

Makes a type nullable (can be `undefined` or `null`).

### ValueOrPromise

```typescript
type ValueOrPromise<T> = T | Promise<T>;
```

A value that may or may not be wrapped in a Promise.

## Class Types

### TConstructor / TAbstractConstructor

```typescript
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
```

Types representing class constructors.

### TClass / TAbstractClass

```typescript
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };
```

Class types with static properties.

### TMixinTarget / TAbstractMixinTarget

```typescript
type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
```

Types for mixin pattern targets.

## Object Utility Types

### ValueOf

```typescript
type ValueOf<T> = T[keyof T];
```

Extracts the value types from an object type.

### ValueOptional / ValueOptionalExcept

```typescript
type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
```

Make specific keys optional while keeping others required, or vice versa.

### TPrettify

```typescript
type TPrettify<T> = { [K in keyof T]: T[K] } & {};
```

Flattens intersection types for better IDE display.

## Const Value Types

### TStringConstValue / TNumberConstValue / TConstValue

```typescript
type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

Extract constant value types from a class.
