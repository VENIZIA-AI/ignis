---
title: Module Utility
description: Loads an optional peer dependency with a clear install error, and without letting the bundler see the specifier
difficulty: beginner
lastUpdated: 2026-07-27
---

# Module Utility

`ModuleUtility` loads an optional peer dependency. IGNIS components depend on packages the framework does not bundle - `nodemailer` for mail, `node-vault` for secrets. Loading one through `ModuleUtility` buys you two things: a missing package throws an install instruction instead of a cryptic crash, and the specifier stays invisible to `Bun.build`.

## In one example

This is how the secrets helper reaches `node-vault`:

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';

// Fails fast with a clear install instruction if the peer is absent.
ModuleUtility.assertInstalled({
  scope: 'HashiCorpVaultHelper',
  modules: ['node-vault'],
  allowRegistered: true,
});

// The specifier is a parameter, so Bun.build never sees it.
const vault = await ModuleUtility.load({ module: 'node-vault' });
const client = vault.default({ endpoint, apiVersion: 'v1' });
```

## Methods

| Method | Signature | What it does |
|--------|-----------|---------------|
| `load` | `load<T>(opts: { module: string }): Promise<T>` | Imports the module as an ES module, resolved from the project root: the copy your own `import` gets. Use this everywhere except a constructor |
| `loadSync` | `loadSync<T>(opts: { module: string }): T` | Same, without awaiting - for a constructor or any path that cannot be async. It resolves with `require`, so a peer that ships both builds comes back as its CommonJS copy unless it was registered (see `preload`) |
| `preload` | `preload(opts: { modules: Array<string> }): Promise<void>` | Loads each module with `load` and registers it, so `loadSync` returns that ES module copy. Call it once at the entrypoint, before the helpers are constructed |
| `assertInstalled` | `assertInstalled(opts: { modules: Array<string>; scope?: string; allowRegistered?: boolean }): void` | Presence check only. Resolves each module in order and throws on the first miss, without executing any of them |
| `register` | `register(opts: { modules: Record<string, AnyType> }): void` | Hands the framework peers the application already holds. `load` and `loadSync` serve a registered specifier from memory, with no filesystem lookup |
| `setProjectRoot` | `setProjectRoot(opts: { projectRoot: string }): void` | Sets the root every peer lookup resolves against. A `ServerApplication` calls it during construction with `configs.projectRoot ?? process.cwd()` |
| `getProjectRoot` | `getProjectRoot(): string` | The current root: `ProjectRootRegistry.getShared() ?? process.cwd()` |

### The project root

`setProjectRoot` and `getProjectRoot` delegate to `ProjectRootRegistry`, which keeps the value in a
`globalThis` slot. A process, or a compiled bundle, can carry two copies of this package, and a root
set through one copy must be found by the other.

You rarely call either one. Every application sets the root for you: set `configs.projectRoot` and
the framework forwards it. `process.cwd()` is only the fallback for when nothing has set one.

### `allowRegistered`

`assertInstalled` reports what is on disk. Set `allowRegistered` to count a `register` entry as present too.

Set it only where `load` or `loadSync` is what finally loads the module. A caller that resolves the specifier itself cannot see the registry - `pino.transport()` resolves inside a worker thread, and the gRPC adapter uses its own `createRequire`. For those, counting a registration as installed would replace a precise error with an opaque one.

## Error message format

| `scope` | Message |
|---------|---------|
| provided | `[ModuleUtility.<method>] <module> is required for <scope>. Please install '<module>' \| Error: <reason>` |
| omitted | `[ModuleUtility.<method>] <module> is required. Please install '<module>' \| Error: <reason>` |

`<reason>` is the underlying failure: `error.message` when the throw was an `Error`, otherwise
`String(error)`. The same line is logged at error level before the error is thrown.

## Why not a plain import

`Bun.build` resolves a literal specifier at bundle time. A literal `require('mailgun.js')` anywhere reachable from an entry point forces every consumer who compiles a binary to install that peer or list it in `external` - even a consumer who never touches mail.

A `const` does not help. `minify: { syntax: true }` folds `const s = 'mailgun.js'; import(s)` straight back into a resolvable literal.

Only a specifier that crosses a function boundary survives as a runtime import. That is the whole reason `ModuleUtility` takes the module name as a parameter.

## Compiled binaries

Runtime resolution needs a `node_modules` to resolve against. A `bun build --compile` binary usually runs without one - the deployment ships the executable and nothing else - so a peer the application genuinely installed is still unreachable at runtime, and the component that needs it dies at boot with the install hint.

**Check the component's options first.** Every component that reaches a peer this way takes it through its own options:

| Component | Option | You pass |
|---|---|---|
| Mail transports | `module` | the `nodemailer` or `mailgun.js` module |
| `RedisSingleHelper`, `RedisClusterHelper`, `RedisSentinelHelper` | `module` | the `ioredis` module |
| `BullMQHelper` | `module` | the `bullmq` module |
| `SocketIOClientHelper` | `module` | the `socket.io-client` module |
| Mail BullMQ queue executor | `module`, and `redis.module` | the `bullmq` module, and the `ioredis` module |
| gRPC component | `module` | `{ connect, protocol }` from `@connectrpc/connect` |
| `HashiCorpVaultHelper` | `client` | an already-built vault client |
| `DotenvVaultHelper` | `decode` | your own decode function |

Prefer the option. It is typed, it lands where it is used, and no ordering can defeat it.

`register` is the fallback: one line at the entrypoint that covers every helper reaching that peer, and the way in for a peer the framework reaches with no options seam in between. The static import is what pulls the library into the binary; `register` is what lets the framework find it there:

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';
import * as vault from 'node-vault';

// At the entrypoint, before anything that reaches the peer runs.
ModuleUtility.register({ modules: { 'node-vault': vault } });
```

The registry is keyed by specifier and the value is returned as-is: what you register under `node-vault` is exactly what `load({ module: 'node-vault' })` hands the caller. `import * as` gives the right shape for a CommonJS peer.

Register before the consumer runs. Nothing enforces that ordering, which is the reason to prefer an options seam wherever one exists.

`register` cannot help a consumer that resolves the specifier itself. A `pino` transport target loads inside a worker thread the registry never reaches, so `pino-pretty` and `pino-roll` must be installed on disk.

Registration is only worth it for the compiled-binary case. An application running from source resolves its peers from `node_modules` already.

## One copy of a peer that ships two builds

`bullmq` and `socket.io-client` ship an ES module build and a CommonJS one. `import { Queue } from 'bullmq'` in your code gets the ES module copy; the helper's constructor cannot await, so `loadSync` reads the peer with `require` and gets the CommonJS copy. Two copies means two classes: `queue instanceof Queue` across the two is `false`. Hold one copy by loading the ES module copy before the helpers are built:

```typescript
import { ModuleUtility } from '@venizia/ignis-helpers';

// Once, at the entrypoint, before a BullMQHelper or SocketIOClientHelper is constructed.
await ModuleUtility.preload({ modules: ['bullmq', 'socket.io-client'] });
```

Or hand the module to the one helper: `new BullMQHelper({ ..., module: await import('bullmq') })`. `ioredis`, `nodemailer`, `mailgun.js` and the SES client ship one build and have one copy either way.

## Notes

- **Resolution is rooted at `getProjectRoot()/node_modules`** via Node's `createRequire`, so peers installed in the consuming application resolve even though this utility ships inside `packages/helpers/dist/`. `process.cwd()` is only the fallback for when no application has called `setProjectRoot` - an application that sets `configs.projectRoot`, which every compiled binary does, resolves its peers somewhere else.
- **`load` resolves from that root too.** It asks the runtime where `getProjectRoot()` would import the module from (`Bun.resolveSync`, the `import` condition of the package's `exports`) and imports that file, so you get the instance your own `import` of the peer holds. A module the project root cannot resolve is imported by name, as before. The result is the ES module namespace: a CommonJS-only peer arrives as `{ default: <exports> }`, as with any dynamic `import()`.
- **`assertInstalled` stops at the first miss.** Later entries are never checked.
- **`assertInstalled` never executes the module** - it only locates the file. Reach for it when you want to fail at startup rather than on first use.
- **Call it once, at startup, not per request.** Place it in an initialisation hook (`configure`, `binding`, `boot`).
- **`register` wins over the filesystem.** `load` and `loadSync` check the registry first, so a registered peer is never resolved. `assertInstalled` ignores the registry unless you set `allowRegistered`.
- **`register` never logs.** It runs at the entrypoint of a compiled binary, which is exactly where no logger provider exists yet.
- **Recommended pattern:** declare the dependency in `peerDependenciesMeta` with `optional: true`, then load it through `ModuleUtility` and pass the feature or class name as `scope` so the thrown message pinpoints the caller.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions

**Files:**

- [`packages/helpers/src/utilities/module.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/module.utility.ts)
- [`packages/helpers/src/utilities/project-root.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/project-root.utility.ts)
