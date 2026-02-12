# Code Style Standards

Maintain consistent code style using **Prettier** (formatting) and **ESLint** (code quality). Ignis provides centralized configurations via the `@venizia/dev-configs` package.

## Quick Reference

| Aspect | Standard |
|--------|----------|
| Interface prefix | `I` (e.g., `IUserService`) |
| Type alias prefix | `T` (e.g., `TUserRequest`) |
| Class naming | PascalCase with suffix (e.g., `UserController`) |
| File naming | kebab-case (e.g., `user.controller.ts`) |
| Private fields | Underscore prefix (`_dataSource`) |
| Binding keys | `@app/[component]/[feature]` |
| Constants | Static readonly class (not enums) |
| Barrel exports | `index.ts` at every folder level |
| Error format | `[ClassName][method] Message` |
| Logging format | `[method] Message \| Key: %s` |
| Default options | `DEFAULT_OPTIONS` constant |
| Type safety | No `any` or `unknown` allowed |
| Scope naming | `ClassName.name` |
| Arguments | Options object (`opts`) |
| Exports | Named exports only |
| Return types | Explicitly defined |
| Control flow | Always use braces (`{}`) |
| Switch statements | Braces + default case required |
| Imports | Node → Third-party → Internal → Relative |
| Function naming | `generate*`, `build*`, `to*`, `is*`, `extract*` |

## Sections

| Section | Description |
|---------|-------------|
| [Tooling](./tooling) | ESLint, Prettier, TypeScript configuration |
| [Naming Conventions](./naming-conventions) | Classes, files, types, binding keys |
| [Type Safety](./type-safety) | Avoiding `any`, explicit returns, generics |
| [Function Patterns](./function-patterns) | Options object, naming, exports |
| [Route Definitions](./route-definitions) | Config-driven routes, OpenAPI integration |
| [Constants & Configuration](./constants-configuration) | Static classes vs enums, defaults |
| [Control Flow & Organization](./control-flow) | Braces, switches, imports, logging |
| [Advanced Patterns](./advanced-patterns) | Mixins, factories, value resolvers |
| [Documentation (JSDoc)](./documentation) | When and how to document code |

## Essential Examples

### Naming

```typescript
// Interfaces use 'I' prefix
interface IUserService { }

// Type aliases use 'T' prefix
type TUserRequest = { };

// Classes use PascalCase with suffix
class UserController extends BaseController { }
class UserService extends BaseService { }
class UserRepository extends BaseRepository { }
```

### File Structure

```
src/components/auth/
├── index.ts              # Barrel exports
├── component.ts          # IoC binding
├── controller.ts         # Routes
└── common/
    ├── index.ts
    ├── keys.ts           # Binding keys
    └── types.ts          # Interfaces
```

### Constants (Static Class vs Enum)

```typescript
// ✅ GOOD - Static class (tree-shakable)
export class UserStatuses {
  static readonly ACTIVE = 'active';
  static readonly INACTIVE = 'inactive';
}

// ❌ AVOID - Enum (not tree-shakable)
enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
```

### Import Order

```typescript
// 1. Node built-ins
import fs from 'node:fs';

// 2. Third-party
import { z } from '@hono/zod-openapi';

// 3. Internal absolute
import { getError } from '@venizia/ignis-helpers';

// 4. Relative (same feature)
import { QueryBuilder } from './query';
```

## See Also

- [Architectural Patterns](../architectural-patterns) - High-level design
- [Common Pitfalls](../common-pitfalls) - Mistakes to avoid
