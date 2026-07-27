---
title: Module Utility
description: Loads an optional peer dependency with a clear install error, and without letting the bundler see the specifier
difficulty: beginner
lastUpdated: 2026-07-27
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
| `register` | `register(opts: { modules: Record<string, AnyType> }): void` | Hands the framework peers the application already holds. A registered specifier is served from memory by all three methods above, with no filesystem lookup |

## Error message format

| `scope` | Message |
|---------|---------|
| provided | `[ModuleUtility.<method>] <module> is required for <scope>. Please install '<module>'` |
| omitted | `[ModuleUtility.<method>] <module> is required. Please install '<module>'` |

## Why not a plain import

`Bun.build` resolves a literal specifier at bundle time. A literal `require('mailgun.js')` anywhere reachable from an entry point forces every consumer who compiles a binary to install that peer or list it in `external` - even a consumer who never touches mail.

A `const` does not help. `minify: { syntax: true }` folds `const s = 'mailgun.js'; import(s)` straight back into a resolvable literal.

Only a specifier that crosses a function boundary survives as a runtime import. That is the whole reason `ModuleUtility` takes the module name as a parameter.

## Compiled binaries

Runtime resolution needs a `node_modules` to resolve against. A `bun build --compile` binary usually runs without one - the deployment ships the executable and nothing else - so a peer the application genuinely installed is still unreachable at runtime, and the component that needs it dies at boot with the install hint.

**Check the component's options first.** Where a component takes the peer through its own options - the mail transports take `module`, `HashiCorpVaultHelper` takes `client`, `DotenvVaultHelper` takes `decode` - use that: it is typed, it lands where it is used, and no ordering can defeat it. `register` is the general fallback, for peers the framework reaches with no options seam in between.

The static import is what pulls the library into the binary; `register` is what lets the framework find it there:

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';
import * as connect from '@connectrpc/connect';

// At the entrypoint, before anything that reaches the peer runs.
ModuleUtility.register({ modules: { '@connectrpc/connect': connect } });
```

The registry is keyed by specifier and the value is returned as-is: what you register under `@connectrpc/connect` is exactly what `load({ module: '@connectrpc/connect' })` hands the caller. `import * as` gives the right shape for a CommonJS peer.

Register before the consumer runs. Nothing enforces that ordering, which is the reason to prefer an options seam wherever one exists.

Registration is only worth it for the compiled-binary case. An application running from source resolves its peers from `node_modules` already.

## Notes

- **Resolution is rooted at `process.cwd()/node_modules`** via Node's `createRequire`, so peers installed in the consuming application resolve even though this utility ships inside `packages/helpers/dist/`.
- **`assertInstalled` stops at the first miss.** Later entries are never checked.
- **`assertInstalled` never executes the module** - it only locates the file. Reach for it when you want to fail at startup rather than on first use.
- **Call it once, at startup, not per request.** Place it in an initialisation hook (`configure`, `binding`, `boot`).
- **`register` wins over the filesystem.** All three loaders check the registry first, so a registered peer is never resolved, and `assertInstalled` treats it as present.
- **Recommended pattern:** declare the dependency in `peerDependenciesMeta` with `optional: true`, then load it through `ModuleUtility` and pass the feature or class name as `scope` so the thrown message pinpoints the caller.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions

**Files:**

- [`packages/helpers/src/utilities/module.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/module.utility.ts)
