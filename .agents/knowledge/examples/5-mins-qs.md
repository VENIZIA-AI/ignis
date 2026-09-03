---
type: Example
title: 5-mins-qs
description: The minimal quickstart example - a single-file controller and application showing the smallest possible IGNIS app.
resource: examples/5-mins-qs
tags: [examples, quickstart]
---

`5-mins-qs` is the entire framework distilled into one `src/index.ts` file: a `HelloController` with a single `@get` route and a `BaseApplication` subclass that registers it and starts the server. No datasource, no repository, no auth - just the three steps its own comments number: define a controller, create the application, start the server.

## What it demonstrates

- `@controller({ path: '/hello' })` with a decorator-based `@get` route, `jsonContent` for the OpenAPI response schema, and the mandatory `binding()` override (empty here, since there is nothing to bind).
- The full seven-phase `BaseApplication` lifecycle stubbed out explicitly (`staticConfigure`, `preConfigure`, `postConfigure`, `setupMiddlewares`), even where a phase does nothing, so a newcomer sees the complete shape.
- `ApiReferenceComponent` registered in `preConfigure()` for interactive docs at `/doc/explorer`.
- Application config passed inline at construction (`host`, `port`, `path: { base: '/api', isStrict: false }`) rather than as an exported config constant imported from `./application`, which is what the larger examples do.

## How to run it

```bash
bun install
bun run start          # bun run src/index.ts directly, no build step
# or
bun run server:dev     # NODE_ENV=development bun run src/index.ts
bun run rebuild        # clean + tsc build, for server:prod
bun run server:prod    # NODE_ENV=production bun run dist/index.js
```

## Notable / non-obvious

- `start` and `server:dev` run TypeScript directly via `bun run src/index.ts`, with no compilation step. This is one of three zero-build examples - `sqlite-quickstart` and `pglite-quickstart` use the same pattern. Every other example's dev script runs `bun .` instead, which needs a `rebuild` first. What is distinctive here is the narration: the numbered comments walk through the zero-build path step by step.

## Related
- [What is IGNIS](/overview/what-is-ignis.md)
- [Controller system](/architecture/controller-system.md)
- [Onboarding](/overview/onboarding.md)
