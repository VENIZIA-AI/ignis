---
title: Module Utility
description: Loads an optional peer dependency with a clear install error, and without letting the bundler see the specifier
difficulty: beginner
lastUpdated: 2026-07-25
---

# Module Utility

`ModuleUtility` loads an optional peer dependency. IGNIS components depend on packages the framework does not bundle - `@connectrpc/connect` for gRPC, `nodemailer` for mail, `node-vault` for secrets. Loading one through `ModuleUtility` buys you two things: a missing package throws an install instruction instead of a cryptic crash, and the specifier stays invisible to `Bun.build`.

## In one example

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';

export class MyGrpcController extends BaseGrpcController {
  async configure() {
    // Fails fast with a clear install instruction if the peer dep is absent.
    ModuleUtility.assertInstalled({
      scope: MyGrpcController.name,
      modules: ['@connectrpc/connect'],
    });

    const { ConnectRouter } = await ModuleUtility.load({ module: '@connectrpc/connect' });
    // ... register routes
  }
}
```

## Methods

| Method | Signature | What it does |
|--------|-----------|---------------|
| `load` | `load<T>(opts: { module: string }): Promise<T>` | Imports the module. Use this everywhere except a constructor |
| `loadSync` | `loadSync<T>(opts: { module: string }): T` | Same, without awaiting - for a constructor or any path that cannot be async |
| `assertInstalled` | `assertInstalled(opts: { modules: Array<string>; scope?: string }): void` | Presence check only. Resolves each module in order and throws on the first miss, without executing any of them |

## Error message format

| `scope` | Message |
|---------|---------|
| provided | `[ModuleUtility.<method>] <module> is required for <scope>. Please install '<module>'` |
| omitted | `[ModuleUtility.<method>] <module> is required. Please install '<module>'` |

## Why not a plain import

`Bun.build` resolves a literal specifier at bundle time. A literal `require('mailgun.js')` anywhere reachable from an entry point forces every consumer who compiles a binary to install that peer or list it in `external` - even a consumer who never touches mail.

A `const` does not help. `minify: { syntax: true }` folds `const s = 'mailgun.js'; import(s)` straight back into a resolvable literal.

Only a specifier that crosses a function boundary survives as a runtime import. That is the whole reason `ModuleUtility` takes the module name as a parameter.

## Notes

- **Resolution is rooted at `process.cwd()/node_modules`** via Node's `createRequire`, so peers installed in the consuming application resolve even though this utility ships inside `packages/helpers/dist/`.
- **`assertInstalled` stops at the first miss.** Later entries are never checked.
- **`assertInstalled` never executes the module** - it only locates the file. Reach for it when you want to fail at startup rather than on first use.
- **Call it once, at startup, not per request.** Place it in an initialisation hook (`configure`, `binding`, `boot`).
- **Recommended pattern:** declare the dependency in `peerDependenciesMeta` with `optional: true`, then load it through `ModuleUtility` and pass the feature or class name as `scope` so the thrown message pinpoints the caller.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions

**Files:**

- [`packages/helpers/src/utilities/module.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/module.utility.ts)
