---
type: Example
title: rpc-api-server
description: A REST API on PGlite with JWT sign-up/sign-in, CRUD routes behind the token, and JSX server-rendered pages. rpc-client-app is its React client.
resource: examples/rpc-api-server
tags: [examples, reference-app]
---

`rpc-api-server` is named for the frontend it feeds ([`rpc-client-app`](/examples/rpc-client-app.md)),
but it is a plain REST application - no gRPC or ConnectRPC anywhere. It runs on PGlite so it needs no
database server, which is what moved this pair into CI: the server's smoke test is in
`EXAMPLES_SMOKE`.

## What it demonstrates

- **JWT auth wired through the framework's own routes** - `preConfigure()` binds `JWT_OPTIONS`
  (JWS, HMAC-signed) and `REST_OPTIONS` (`useAuthController: true`, pointing at
  `AuthenticationService`), then registers `AuthenticateComponent` and the JWT strategy. Sign-up,
  sign-in and change-password live in `src/services/authentication.service.ts`, hashing with
  `Bun.password` and signing with `JWSTokenService`.
- **CRUD behind the token** - `src/controllers/configuration.controller.ts` is an unmodified
  `ControllerFactory.defineCrudController` output, every route requiring `authenticate: {
  strategies: [Authentication.STRATEGY_JWT] }`. `createdBy` is always the signed-in user: the CRUD
  factory drops the audit keys from its default request bodies.
- **Server-side JSX** - `src/controllers/view.controller.tsx` renders `/` and `/about` with
  `defineJSXRoute` and `htmlContent`; the pages live in `src/views`. This is the only example doing
  SSR.
- **`src/models/auth.schema.ts`** types the auth routes' responses - the same schema
  `rpc-client-app`'s generated `schema.d.ts` is typed from.

## How to run it

```bash
bun install
APP_ENV_JWT_SECRET=$(openssl rand -hex 32) bun run start   # http://localhost:3000/api
bun test                                                       # smoke test: signs up, signs in, CRUD with the token, loads a JSX page
```

A new secret on each start signs every user out; put a fixed one in `.env` to keep tokens valid
across restarts.

## Notable / non-obvious

- This example is one of `EXAMPLES_SMOKE` in the root `Makefile` - `make examples-smoke` runs its
  `bun test` in CI, no docker needed, because the smoke test boots with an in-memory PGlite database.
- [`rpc-client-app`](/examples/rpc-client-app.md)'s hooks are generated from this server's
  `/api/doc/openapi.json`; regenerate them after any route or schema change here.

## Related
- [rpc-client-app](/examples/rpc-client-app.md)
- [Controller system](/architecture/controller-system.md)
- [pglite-quickstart](/examples/pglite-quickstart.md)
