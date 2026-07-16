---
type: Example
title: rpc-api-server
description: A REST API server example exercising repository CRUD operations, JSX server-side rendering, and JWT-guarded routes, despite the RPC name.
resource: examples/rpc-api-server
tags: [examples, reference-app]
---

`rpc-api-server` (`@nx/rpc-api-server`) is named for the frontend it feeds (`rpc-client-app`), but its source has no gRPC or ConnectRPC code at all - it is a plain REST application. `postConfigure()` runs eight numbered CASE blocks straight against `ConfigurationRepository` (`findOne`, `find` with field selection and `include`, `create`, `createAll`, `updateById`, `updateAll` with `shouldReturn: false`, `deleteById`, `deleteAll` with `shouldReturn: true`) - a working, runnable tour of the CRUD API surface.

## What it demonstrates

- `TestController` mounts `/test/:id` (path-param route) and `/test/2` (JWT-guarded via `authenticate: { strategies: [Authentication.STRATEGY_JWT] }`).
- `ViewController` renders JSX server-side with `defineJSXRoute` and `htmlContent` responses at `/` (home) and `/about` - the only example doing SSR.
- `HealthCheckComponent` and `ApiReferenceComponent` are registered the same way as in every other example.
- An `AuthenticationService` exists under `src/services/` but is not wired to `AuthenticateComponent` in `application.ts` - it is unused by the currently registered routes.

## How to run it

```bash
bun install
bun run migrate:dev             # drizzle-kit push --config=src/migration.ts
bun run server:dev              # NODE_ENV=development bun .
bun run compile:linux           # bun build --compile, standalone linux-x64 binary
```

## Notable / non-obvious

- The committed `main` field points at `dist/index.js`, and the same `compile:linux` script (`bun build --compile --minify --sourcemap --target=bun-linux-x64 ... --outfile ./dist/vert`) also appears verbatim in `vert`'s package.json, output filename `vert` included - a copy-paste artifact.
- `rpc-client-app`'s committed `schema.d.ts` includes `/test/:id`, `/test/2`, `/`, `/about`, and `/health-check` paths that match this server exactly, but also `/auth/sign-in`, `/auth/sign-up`, `/auth/change-password`, `/auth/who-am-i` - none of which this server's `application.ts` currently registers. The generated types are stale relative to the committed backend.

## Related
- [rpc-client-app](/examples/rpc-client-app.md)
- [Controller system](/architecture/controller-system.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
