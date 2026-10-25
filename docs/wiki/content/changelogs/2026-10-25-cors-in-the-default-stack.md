---
title: CORS Is Installed First, So Framework Errors Carry Its Headers
description: "configs.middlewares.cors now installs Hono's cors() as the first middleware, before the request id and the body limit. A 413 from the body limit, and any other early framework response, is readable from a browser."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-25

## CORS is installed first, so framework errors carry its headers

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A cross-origin browser client that sends a body over `configs.middlewares.bodyLimit` used to see a network error, because the `413` carried no CORS headers. `configs.middlewares.cors` now installs `cors()` before everything else, so the `413` is readable.

## What changed

- **`configs.middlewares.cors` is read.** It was typed (`ICORSOptions`) but nothing used it. When it is set and `enable !== false`, the application installs Hono's `cors()` as the first middleware of the default stack, before the request id and the body limit. With no `cors` config, nothing is installed, as before.
- **Early responses carry the headers.** The body-limit `413`, a `400` for a body the request spy cannot parse, and the error envelope all leave with the headers.
- **A preflight is unchanged.** `OPTIONS` is answered by `cors()` with `204` and the allow headers; the body limit never sees it.
- **Boot validation.** The application refuses to start when `origin` is missing or empty, or when `credentials: true` is combined with the origin `'*'`.

```typescript
const application = new MyApplication({
  scope: 'MyApp',
  config: {
    path: { base: '/api', isStrict: true },
    middlewares: {
      bodyLimit: { enable: true, maxSize: 1024 * 1024 },
      cors: { enable: true, origin: ['https://app.example.com'], exposeHeaders: ['x-request-id'] },
    },
  },
});
```

## Who is affected

- **Apps that call `cors()` in `setupMiddlewares()`.** They keep working, but their own `cors()` runs after the framework's early exits, so a `413` still has no CORS headers. Move the policy into `configs.middlewares.cors` and remove the call.
- **Apps that set `configs.middlewares.cors` believing it was applied.** It is now applied. Check that the options are what you want.
- **Everyone else.** No action needed.
