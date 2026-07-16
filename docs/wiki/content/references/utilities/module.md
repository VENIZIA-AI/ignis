---
title: Module Utility
description: Pre-flight check that fails fast with an install instruction when an optional peer dependency is missing
difficulty: beginner
lastUpdated: 2026-07-16
---

# Module Utility

A pre-flight check for optional peer dependencies. IGNIS helpers and components often depend on packages that are not bundled with the framework (`@connectrpc/connect` for gRPC, `@hono/swagger-ui` for the Swagger component, and so on). Calling `validateModule` before a lazy `import()` throws a clear, actionable error instead of a cryptic "Cannot find module" crash.

## In one example

```typescript
import { validateModule } from '@venizia/ignis-helpers';

const GRPC_MODULES = ['@connectrpc/connect'];

export class MyGrpcController extends BaseGrpcController {
  async configure() {
    // Fails fast with a clear install instruction if the peer dep is absent
    await validateModule({ scope: MyGrpcController.name, modules: GRPC_MODULES });

    const { ConnectRouter } = await import('@connectrpc/connect');
    // ... register routes
  }
}
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `validateModule` | `validateModule(opts: { scope?: string; modules: Array<string> }): Promise<void>` | Resolves each module in `modules`, in order, via `require.resolve`. Throws an `ApplicationError` on the first one that cannot be found. |

## Error message format

| `scope` | Message |
|---------|---------|
| provided | `[validateModule] <module> is required for <scope>. Please install '<module>'` |
| omitted | `[validateModule] <module> is required. Please install '<module>'` |

## Notes

- **Resolution is rooted at `process.cwd()/node_modules`** via Node's `createRequire`, so peer dependencies installed in the consuming application resolve correctly even though this utility ships inside `packages/helpers/dist/`.
- **Evaluated in order - first miss wins.** With multiple `modules`, the loop stops at the first unresolved one and throws; later entries are never checked.
- **`async` for call-site consistency only.** Resolution itself is synchronous (`require.resolve`); the function returns a `Promise<void>` so every call site can `await` it uniformly.
- **Call it once, at startup - not per request.** Place it in an initialisation hook (`configure`, `binding`, `boot`), before the guarded `import()`.
- **Recommended pattern:** declare the dependency as `peerDependenciesMeta` with `optional: true` in `package.json`, call `validateModule` at the top of the method that needs it, and pass the feature or class name as `scope` so the thrown message pinpoints the caller.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions

**Files:**

- [`packages/helpers/src/utilities/module.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/module.utility.ts)
