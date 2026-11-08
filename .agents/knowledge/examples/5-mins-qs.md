---
type: Example
title: 5-mins-qs
description: The minimal quickstart example - one controller, one route and generated API docs, the smallest possible IGNIS app.
resource: examples/5-mins-qs
tags: [examples, quickstart]
---

`5-mins-qs` is the smallest IGNIS app, in three source files: `src/hello.controller.ts` (`HelloController`, one `@get` route), `src/application.ts` (a `BaseApplication` subclass that registers `ApiReferenceComponent`, plus the config and the logger provider) and `src/index.ts` (stamps the build info, calls `application.init()` and `application.start()`). No datasource, no repository, no auth.

## What it demonstrates

- `@controller({ path: '/hello' })` with a decorator-based `@get` route, `OpenApiResponses.jsonContent` for the OpenAPI response schema, and the mandatory `binding()` override (empty here, since there is nothing to bind).
- `BaseApplication`'s mandatory configuration hooks (`staticConfigure`, `preConfigure`, `postConfigure`, `setupMiddlewares`) stubbed out explicitly, even where a hook does nothing, so a newcomer sees the complete shape.
- `ApiReferenceComponent` registered in `preConfigure()` for interactive docs at `/doc/explorer`.
- `artifacts: AutoArtifacts` in the application config: the boot package finds `HelloController`, so nothing registers it by hand.
- `LoggerFactory.use({ provider: WinstonLogger })` before the application is built, because a compiled binary cannot load the default provider at run time.

## How to run it

```bash
bun install
bun run server:dev     # NODE_ENV=development bun run src/index.ts, no build step
bun run compile        # dist/bin, a single binary with the build stamp baked in
bun run clean          # rm -rf dist
```

## Notable / non-obvious

- `server:dev` runs TypeScript directly via `bun run src/index.ts`, with no compilation step. Every server example's dev script runs its source file directly the same way; the two browser-side examples, `browser-bff` and `rpc-client-app`, run `vite` and need no build step either. What is distinctive here is its size: three files, no datasource and no repository.

## Related
- [What is IGNIS](/overview/what-is-ignis.md)
- [Controller system](/architecture/controller-system.md)
- [Onboarding](/overview/onboarding.md)
