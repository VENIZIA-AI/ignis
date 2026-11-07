---
title: A worker without controllers no longer bundles zod
description: "A browser worker built on WorkerApplication that declares no REST controller drops zod, zod-to-openapi and @hono/zod-openapi from its bundle: 569 KB becomes 137 KB, 146 KB gzipped becomes 45 KB."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-worker', '@venizia/ignis']
---

# Changelog - 2026-11-08

## A worker without controllers no longer bundles zod

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A browser worker that declares no controller, and so no validated or OpenAPI route, no longer carries zod, zod-to-openapi or `@hono/zod-openapi`.

## What changed

- **Smaller worker.** A minimal `WorkerApplication` bundles to 136,953 B (44,828 B gzipped) instead of 568,535 B (145,890 B gzipped), measured with `bun build --target=browser --minify`.
- **Routers are plain `Hono` until the REST controller layer loads.** `RestApplication` no longer imports `@hono/zod-openapi`. Loading a REST controller (`BaseRestController`, `AbstractRestController`) registers `OpenAPIHono`, and from then on the application's two routers are `OpenAPIHono`, as before. A worker with controllers bundles the same as before and validates the same way.
- **`ServerApplication` is unchanged at run time.** It overrides the new protected `createRouter({ strict })` and always builds `OpenAPIHono`, so the API reference keeps its registry.
- **A size limit.** `worker-bundle-budget.test.ts` in `@venizia/ignis-worker` fails when a minimal worker bundles zod, zod-to-openapi or `@hono/zod-openapi`, or grows past 56 KB gzipped or 170 KB raw.

## Who is affected

- **Server apps (`BaseApplication`).** No action needed.
- **Workers with controllers.** No action needed: their routers are still `OpenAPIHono` at run time.
- **Code that calls `getServer()` or `getRootRouter()` on a `RestApplication` or `WorkerApplication` and uses `.openapi()`, `.doc()` or `.openAPIRegistry`.** The return type is now `Hono`. See below.

## Breaking changes

> [!WARNING]
> The type of `getServer()` and `getRootRouter()` on `RestApplication`, `WorkerApplication` and `IApplication` is `Hono`, not `OpenAPIHono`.

**Before:**

```typescript
class App extends WorkerApplication {
  override setupMiddlewares(): void {
    this.getRootRouter().doc('/doc', { openapi: '3.0.0', info: { title: 'x', version: '1' } });
  }
}
```

**After:**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';

class App extends WorkerApplication {
  declare protected rootRouter: OpenAPIHono;

  // Always an OpenAPIHono, whether or not a controller is in the program.
  protected override createRouter(opts: { strict: boolean }): OpenAPIHono {
    return new OpenAPIHono({ strict: opts.strict });
  }

  override getRootRouter(): OpenAPIHono {
    return this.rootRouter;
  }

  override setupMiddlewares(): void {
    this.getRootRouter().doc('/doc', {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
    });
  }
}
```

## Details

- A worker that never loads a REST controller but mounts its own `OpenAPIHono` on `getServer()` still works: Hono mounts any router. Only the root's own OpenAPI registry is missing.
- `RouterFactories` is internal and not exported.

| File | Package |
|------|---------|
| `src/base/applications/rest.ts` | kernel |
| `src/base/applications/router-factory.ts` | kernel |
| `src/base/controllers/rest/abstract.ts` | kernel |
| `src/base/applications/server.ts` | core |
