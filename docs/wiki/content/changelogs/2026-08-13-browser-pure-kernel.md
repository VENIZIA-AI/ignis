---
title: A Browser-Pure Kernel Under `@venizia/ignis`
description: The half of IGNIS that never needed a server now lives in its own package, guarded by a build gate. Every import you already write keeps working.
---

# Changelog - 2026-08-13

## A Browser-Pure Kernel Under `@venizia/ignis`

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Internal Refactor" />

**In one line.** IGNIS split into a browser-pure kernel and a server layer, and nothing you import changed.

## What changed

- **New package `@venizia/ignis-kernel`.** It holds the dependency injection container, the application lifecycle, REST controllers, the repository and datasource abstractions, and the authentication and authorization seams - about 128 files with no node builtin anywhere in them.
- **The application base is four layers, not two.** `AbstractApplication` and `RestApplication` moved into the kernel; `ServerApplication` and `BaseApplication` stayed in `@venizia/ignis`.
- **A build gate proves the kernel stays clean.** `make purity` bundles it for a browser target and fails on any node builtin or node global.
- **`make <package>` no longer destroys `dist/` on a failed build.** It type-checks first and cleans only once the project compiles.

## Who is affected

- **Every existing application.** No action needed. `@venizia/ignis` re-exports the whole kernel, so all 225 public symbols still resolve from the same import path. `BaseApplication` still has every method it had.
- **Anyone extending `AbstractApplication` directly.** Check your subclass. That class no longer carries `start()`, `stop()`, `getServer()` or `getRootRouter()` - extend `BaseApplication` as before, or one of the new layers on purpose.
- **Anyone adding code to the kernel.** One new rule, in "The one rule" below.

## One breaking change: `AbstractApplication` narrowed

Every export name survived - the surface grew from 216 to 227 and lost none. But a name surviving is not the same as a signature surviving, and one signature changed:

```ts
// before
abstract class AbstractApplication<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'>
  extends Container implements IApplication<AppEnv, AppSchema, BasePath>

// now
abstract class AbstractApplication extends Container
```

The generics and roughly a dozen members - `start`, `stop`, `getServer`, `getRootRouter`, `getServerHost`, `getServerPort`, `getServerAddress`, `getServerInstance` - did not disappear. They moved down to the layers that can actually provide them: the router to `RestApplication`, the listening server to `ServerApplication`.

**Migration.** `AbstractApplication<AppEnv, AppSchema, BasePath>` becomes `ServerApplication<AppEnv, AppSchema, BasePath>`, which is what the old class was. `BaseApplication` is unaffected, so an application that extends it - almost every application - changes nothing.

Without the migration you get `TS2315: Type 'AbstractApplication' is not generic`, which names the symptom rather than the cause.

**Why there is no compatibility alias.** A deprecated `AbstractApplication extends ServerApplication` would make the `extends` case compile again, and it would quietly break something worse: `BaseApplication` extends `ServerApplication` directly, so `app instanceof AbstractApplication` would start returning **false** for every real application. A loud compile error beats a silent runtime lie.

Counting export names is how this was nearly missed - a name diff cannot see a signature change. The release check now compares declarations, not names.

## The four layers

Each layer adds exactly one capability, so a host takes only what it can support.

| Class | Package | Adds | Needs a server? |
|---|---|---|---|
| `AbstractApplication` | `ignis-kernel` | config, lifecycle hooks, `init()`, the DI container | no |
| `RestApplication` | `ignis-kernel` | the `OpenAPIHono` routers, `getServer()`, `getRootRouter()` | no |
| `ServerApplication` | `ignis` | `start()`, `stop()`, `getServerHost()`, Bun and Node hosting | yes |
| `BaseApplication` | `ignis` | resource registration, secrets, boot | yes |

```typescript
// Unchanged. This is still the class you extend.
import { BaseApplication } from '@venizia/ignis';

class Application extends BaseApplication {
  preConfigure(): void {
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
    this.controller(UserController);
  }
}
```

`RestApplication` is the interesting one. It owns the router but never opens a socket, so a host that receives requests some other way - a Web Worker, a test harness - can extend it and serve the same controllers.

## The one rule

Four methods on `AbstractApplication` are called from its **constructor**, before any subclass field exists:

| Method | Kernel default | `ServerApplication` override |
|---|---|---|
| `getDefaultAsyncContextEnabled()` | `false` | `true` |
| `getEnvServerHost()` | `undefined` | `process.env.HOST` |
| `getEnvServerPort()` | `undefined` | `process.env.PORT` |
| `getProjectRoot()` | `''` | `process.cwd()` |

> [!WARNING]
> An override must return a literal or read module-level state only. Reading `this.something` from one of these yields `undefined`, silently, because the subclass field has not been assigned yet. `getProjectRoot()` is the one applications override most often.

That is also why `asyncContext.enable` now defaults to `false` in the kernel and `true` on `ServerApplication`: `hono/context-storage` needs `node:async_hooks`, which a browser does not have. Server behaviour is unchanged.

## The purity gate

```bash
make purity           # every entry claimed browser-pure
make purity-kernel    # the kernel alone
make purity-test      # the gate's own regression tests
```

It runs in CI after lint. A node builtin or a node global in the kernel passes `tsc` and fails here.

A global read is graded. `globalThis.process.env.X` and a bare `process.env.X` throw in a browser and
fail the gate. `globalThis.process?.env?.X` reads a property of an object that always exists, so the
gate lists it as `guarded` and stays green.

> [!WARNING]
> A bare `process?.env?.X` is also graded `guarded`, and that grade is only right when `process` is a
> local binding. On a free identifier the optional chain does not help - the read throws
> `ReferenceError` before `?.` is reached. Write `globalThis.process?.env?.X` in kernel code so the
> grade matches the behaviour.

> [!NOTE]
> The gate cannot be a text search. `bun build --target=browser` replaces an unpolyfillable builtin with an empty object, exits 0, and leaves no trace of the specifier in the output. It also inlines `process.env.NODE_ENV` at compile time. The gate reads the `--metafile` module graph instead, passes `--env=disable`, and matches specifiers against Node's own `builtinModules` list.

When you add code to the kernel, import helpers through `@venizia/ignis-helpers/core` or `/common`. The root barrel reaches `ioredis`, and `ioredis` needs `tls`.

## Files changed

| Area | What |
|---|---|
| [`packages/kernel`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel) | New package - `@venizia/ignis-kernel` |
| [`packages/core-server/src/base/applications`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/applications) | `ServerApplication` added; `BaseApplication` now extends it |
| [`packages/core-server/src/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/index.ts) | Re-exports the kernel, keeping the public surface whole |
| [`packages/helpers/src/core.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/core.ts) | Widened with pure parse, retry and performance utilities |
| [`scripts/purity`](https://github.com/VENIZIA-AI/ignis/blob/main/scripts/purity) | New browser purity gate |

## Related

- [Application reference](/references/base/application.md) - the four layers in full
- [Dependency injection](/references/base/dependency-injection.md) - the container now ships from the kernel
