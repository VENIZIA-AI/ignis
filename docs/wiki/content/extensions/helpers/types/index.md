---
title: Types
description: Shared utility types, resolver functions, and constant classes exported from @venizia/ignis-helpers
difficulty: beginner
---

# Types

`@venizia/ignis-helpers` exports the utility types, lazy-value resolvers, and constant classes (`HTTP`, `GRPC`, `RuntimeModules`, ...) that the rest of the IGNIS stack builds on.

## In one example

`TValueOrResolver` plus `resolveValue` is the core pattern for an option that can be given eagerly or lazily.

```typescript
import { TValueOrResolver, resolveValue } from '@venizia/ignis-helpers';

function configure(opts: { timeout: TValueOrResolver<number> }) {
  const timeout = resolveValue(opts.timeout);
  // works whether opts.timeout is 5000 or () => 5000
}

configure({ timeout: 5000 });
configure({ timeout: () => 5000 });
```

## How it works

- **Escape hatches, not the norm.** `AnyType` and `AnyObject` exist for the rare case a shape truly cannot be known at compile time. The framework prefers types derived from definitions, like `typeof X.schema`, everywhere else.

| Type | Is |
|---|---|
| `AnyType` | `any` |
| `AnyObject` | `Record<string \| symbol \| number, any>` |

- **Nullable and async are explicit.** `TNullable<T>` and `ValueOrPromise<T>` appear on most framework method signatures. One declared type covers both the sync and the async implementation.

| Type | Shape |
|---|---|
| `TNullable<T>` | `T \| undefined \| null` |
| `ValueOrPromise<T>` | `T \| Promise<T>` |

- **Resolvers defer construction.** `TResolver`/`TAsyncResolver` and their `TValueOrResolver`/`TValueOrAsyncResolver` unions let a config option be given eagerly or lazily. `resolveValue`/`resolveValueAsync` collapse either shape to a value.
- **Class constructors pass through untouched.** `isClass()` detects them, so the resolver never invokes a class as if it were a function. It's re-exported from `@venizia/ignis-inversion` into `helpers`.
- **Const classes replace string unions.** A class of `static readonly` fields, for example `HTTP` or `RuntimeModules`, is a value namespace. `TConstValue<typeof X>` derives its own union type from those fields - one declaration, no duplicated string literals.

## Common tasks

### Type an options object with a sync-or-async callback

`ValueOrPromise<T>` is the standard shape for a callback that may or may not be async.

```typescript
import { ValueOrPromise } from '@venizia/ignis-helpers';

function connect(opts: { host: string; onReady?: () => ValueOrPromise<void> }) {}
```

### Detect the current runtime

`RuntimeModules.detect()` returns `'bun'` when `typeof Bun !== 'undefined'`, `'node'` otherwise.

```typescript
import { RuntimeModules } from '@venizia/ignis-helpers';

if (RuntimeModules.isBun()) {
  // Bun-specific path
}
```

### Derive a union type from a constant class

`TConstValue<typeof X>` extracts the union of a const class's static values, so the type never drifts from the values.

```typescript
import { TConstValue, RuntimeModules } from '@venizia/ignis-helpers';

type TRuntimeModule = TConstValue<typeof RuntimeModules>; // 'node' | 'bun'
```

### Resolve a value that may be eager or lazy, sync or async

`resolveValueAsync` accepts a direct value, a sync resolver, or an async resolver, and always returns a `Promise`.

```typescript
import { TValueOrAsyncResolver, resolveValueAsync } from '@venizia/ignis-helpers';

type ConfigOption = TValueOrAsyncResolver<{ host: string }>;

const fromEnv: ConfigOption = async () => ({ host: process.env.DB_HOST! });
const resolved = await resolveValueAsync(fromEnv);
```

### Look up an HTTP header, content type, or status constant

`HTTP` groups headers, header values, methods, and status codes under one class.

```typescript
import { HTTP } from '@venizia/ignis-helpers';

response.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPLICATION_JSON);
response.status(HTTP.ResultCodes.RS_4.NotFound);
```

### Constrain a mixin's base class

`TMixinTarget<T>` types a mixin factory's `Base` parameter so the returned class keeps `T`'s shape.

```typescript
import { TMixinTarget } from '@venizia/ignis-helpers';

function WithTimestamps<T extends TMixinTarget<BaseEntity>>(Base: T) {
  return class extends Base {
    createdAt = new Date();
  };
}
```

### Flatten an intersection type for readable hover tooltips

`TPrettify<T>` collapses `A & B` into a single flat object type. IDE tooltips render that far more readably than a chain of intersections.

```typescript
import { TPrettify } from '@venizia/ignis-helpers';

type Merged = TPrettify<{ id: string } & { name: string }>;
// Hovers as { id: string; name: string } instead of { id: string } & { name: string }
```

See the [Full reference](/extensions/helpers/types/reference) for every type, resolver function, and constant - including the full `HTTP.Headers`, `HTTP.ResultCodes`, and `GRPC` tables.

## See also

- [Full reference](/extensions/helpers/types/reference) - every type, resolver, and constant class
- [Dependency Injection](/guides/core-concepts/dependency-injection) - `TInjectionGetter` and DI-adjacent types in use
- [Repository Mixins](/references/base/repositories/mixins) - `TMixinTarget` in use
- [Helpers Overview](/extensions/helpers/) - all available helpers

**Files:**

- [`packages/helpers/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types.ts) - utility types, resolvers, field-mapping types
- [`packages/helpers/src/common/constants/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/index.ts) - constants barrel
