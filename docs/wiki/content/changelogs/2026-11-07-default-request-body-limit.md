---
title: Every route has a request body limit of 5 MiB by default
description: "With no body limit configured, the application now limits every request body to 5 MiB. The application config can change the default, and a route that takes larger bodies sets its own limit with BodyLimits.route."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-07

## Every route has a request body limit of 5 MiB by default

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** With no `middlewares.bodyLimit` configured, an application accepted bodies up to Bun's own default of 128 MiB on every route. Every route is limited to 5 MiB now. A route that takes larger bodies sets its own limit.

## What changed

- **A default of 5 MiB.** An application with no `middlewares.bodyLimit` installs the limit on every route, ahead of every other middleware. A body over it answers `413` with `core.request.body_too_large`, whether it declares its length or arrives chunked.
- **The application config changes it.** A configured `middlewares.bodyLimit` replaces the default, larger or smaller. With a `path`, only the routes under it are limited. `enable: false` removes the limit.
- **A route sets its own.** `BodyLimits.route({ maxSize })` in a route's `middleware` holds that route to its own limit, and the default stands aside for it.
- **Upload routes.** The static-asset upload route with `maxBytes` carries its own limit: `maxFiles` files of `maxBytes` each plus the multipart framing (4 KiB per file and 64 KiB for the other parts). A chunked upload with no declared length is counted too. Without `maxBytes` the route is held to the default.
- **Bun's own limit.** `configs.server.maxRequestBodySize` (128 MiB by default) still answers first when it is lower than a route's limit. Raise it to at least the largest limit.

## Who is affected

- **Routes that take bodies over 5 MiB without declaring it** (uploads, imports, large JSON). They now answer `413`. Give each one `BodyLimits.route`, or raise the default in `middlewares.bodyLimit`.
- **Applications that added their own `hono/body-limit` in `setupMiddlewares()`.** The framework limit now runs first and refuses what is over 5 MiB before yours. Move the limit into `middlewares.bodyLimit` in the constructor config.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A route that accepted a body over 5 MiB now answers `413`.

**Before:**

```typescript
// setupMiddlewares(): runs after the framework's own early middleware
server.use('*', bodyLimit({ maxSize: 100 * 1024 * 1024 }));
```

**After:**

```typescript
// One ceiling for the application: the constructor config
new Application({
  scope: 'App',
  config: { /* ... */ middlewares: { bodyLimit: { maxSize: 100 * 1024 * 1024 } } },
});

// Or one route that takes large bodies, and 5 MiB for the rest
this.defineRoute({
  configs: { ...routeConfig, middleware: [BodyLimits.route({ maxSize: 50 * 1024 * 1024 })] },
  handler,
});
```

## Details

| File | Package |
|------|---------|
| `src/base/applications/body-limit.ts` | kernel |
| `src/base/applications/rest.ts` | kernel |
| `src/components/static-asset/controller/route-options.ts` | core |
