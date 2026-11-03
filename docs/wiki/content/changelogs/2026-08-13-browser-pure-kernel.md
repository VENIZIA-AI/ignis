---
title: A Browser-Pure Kernel Under `@venizia/ignis`
description: The half of IGNIS that never needed a server now lives in its own package, @venizia/ignis-kernel, and every import you already write keeps working.
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-13

## A Browser-Pure Kernel Under `@venizia/ignis`

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Internal Refactor" />

**In one line.** IGNIS split into a browser-pure kernel and a server layer, and nothing you import changed.

## What changed

- **New package `@venizia/ignis-kernel`.** It holds the dependency injection container, the application lifecycle, REST controllers, the repository and datasource abstractions, and the authentication and authorization seams, with no node builtin in it.
- **The application base is four layers, not two.** `AbstractApplication` and `RestApplication` moved into the kernel; `ServerApplication` and `BaseApplication` stayed in `@venizia/ignis`.
- **`RestApplication`** owns the router but never opens a socket, so a host that receives requests another way (a Web Worker, a test harness) can extend it and serve the same controllers.

| Class | Package | Adds | Needs a server? |
|---|---|---|---|
| `AbstractApplication` | `ignis-kernel` | config, lifecycle hooks, `init()`, the DI container | no |
| `RestApplication` | `ignis-kernel` | the `OpenAPIHono` routers, `getServer()`, `getRootRouter()` | no |
| `ServerApplication` | `ignis` | `start()`, `stop()`, `getServerHost()`, Bun and Node hosting | yes |
| `BaseApplication` | `ignis` | resource registration, secrets, boot | yes |

## Who is affected

- **Every existing application.** No action needed. `@venizia/ignis` re-exports the whole kernel, and `BaseApplication` still has every method it had.
- **Anyone extending `AbstractApplication` directly.** See the breaking change below.
- **Anyone overriding the constructor-time methods below.** See the warning.

## Breaking changes

> [!WARNING]
> `AbstractApplication` no longer carries the generics or `start()`, `stop()`, `getServer()`, `getRootRouter()`, `getServerHost()`, `getServerPort()`, `getServerAddress()` and `getServerInstance()`. They moved to the layers that can provide them.

**Before:**

```ts
abstract class AbstractApplication<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'>
  extends Container implements IApplication<AppEnv, AppSchema, BasePath>
```

**After:**

```ts
abstract class AbstractApplication extends Container
```

**Migration.** `AbstractApplication<AppEnv, AppSchema, BasePath>` becomes `ServerApplication<AppEnv, AppSchema, BasePath>`, which is what the old class was. An application that extends `BaseApplication` - almost every application - changes nothing. Without the migration you get `TS2315: Type 'AbstractApplication' is not generic`.

There is no compatibility alias, because `app instanceof AbstractApplication` would start returning false for every real application.

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

## Details

Four methods on `AbstractApplication` are called from its constructor, before any subclass field exists:

| Method | Kernel default | `ServerApplication` override |
|---|---|---|
| `getDefaultAsyncContextEnabled()` | `false` | `true` |
| `getEnvServerHost()` | `undefined` | `process.env.HOST` |
| `getEnvServerPort()` | `undefined` | `process.env.PORT` |
| `getProjectRoot()` | `''` | `process.cwd()` |

> [!WARNING]
> An override must return a literal or read module-level state only. Reading `this.something` from one of these yields `undefined`, silently, because the subclass field is not assigned yet. `getProjectRoot()` is the one applications override most often.

`asyncContext.enable` now defaults to `false` in the kernel and `true` on `ServerApplication`, because `hono/context-storage` needs `node:async_hooks`. Server behaviour is unchanged.

See also: [Application reference](/references/base/application.md) and [Dependency injection](/references/base/dependency-injection.md).
