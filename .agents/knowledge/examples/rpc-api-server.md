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

- The committed `main` field points at `dist/index.js`, and the same `compile:linux` script (`bun build --compile --minify-whitespace --minify-syntax --sourcemap --env=disable --target=bun-linux-x64 ... --outfile ./dist/vert`) also appears verbatim in `vert`'s package.json, output filename `vert` included - a copy-paste artifact.
- `rpc-client-app`'s committed `schema.d.ts` is stale relative to this backend in two ways. Its test paths are the literal keys `/test/1` and `/test/2`, with byte-identical bodies and no parameterized path anywhere in the file, while `TestController` actually serves `/:id` and `/2` - the types were captured against an earlier route shape. It also declares `/auth/sign-in`, `/auth/sign-up`, `/auth/change-password`, and `/auth/who-am-i`, none of which this server's `application.ts` currently registers. Only `/`, `/about`, and `/health-check` still match.

## Related
- [rpc-client-app](/examples/rpc-client-app.md)
- [Controller system](/architecture/controller-system.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
