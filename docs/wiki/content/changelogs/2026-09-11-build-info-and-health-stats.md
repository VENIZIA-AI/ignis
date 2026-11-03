---
title: A Build Stamps Itself, And Health Answers Twice
description: A new ignis-build-info command stamps a build, GET /health gains a timestamp, GET /health/stats reports build, process and memory behind a gate, and the datasource env variables that never selected anything are removed.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-11

## A build stamps itself, and health answers twice

<Badge type="tip" text="Feature" /> <Badge type="warning" text="Fix" /> <Badge type="danger" text="Breaking" />

**In one line.** A service can now say which commit it runs, and `GET /health/stats` reports it, with process and memory, behind a gate.

## What changed

- **`ignis-build-info generate`.** Writes the stamp at build time, as a const (`--out src/_build_info.ts`) or as JSON (`--out public/build-info.json --format json`). At your entrypoint, call `BuildInfoRegistry.set({ buildInfo: BUILD_INFO })` from `@venizia/ignis-helpers/core`. Nothing is read at run time, so it works in a compiled binary or a Distroless image.
- **Field sources.** Each field comes from CI variables first (`APP_ENV_BUILD_VERSION`, `APP_BUILD_VERSION`, `APP_ENV_BUILD_COMMIT_TAG`, `APP_BUILD_COMMIT`, `APP_BUILD_BRANCH`, `APP_ENV_BUILD_DATE`, `APP_BUILD_DATE`, plus the CI provider's own), then `git`, then `package.json`. Anything left reads `unspecified`. `BuildInfoResolver.resolve` and `generateBuildInfo` are `async`.
- **`GET /health`.** Stays minimal and now answers `{ "status": "ok", "timestamp": "..." }`.
- **`GET /health/stats`.** Reports `build`, `process` and `memory`. With no `enable` set, it is mounted only when `NODE_ENV` is one of `local`, `debug`, `development`, `dev` or `sit`. `staging`, `uat`, `production`, an unrecognised name and an unset `NODE_ENV` keep it shut.
- **Gate options.** `stats: { enable, secretKey }`. `enable: false` leaves the route unmounted. With `secretKey`, the route answers only a request carrying it in `X-Health-Key`; a missing or wrong key gets 404, not 401. A `secretKey` that is set but blank fails closed. With no `secretKey`, the route is open to whatever can reach the port. The gate is per container, so two applications in one process keep their own.
- **Works without the generator.** `stats.buildInfo` wins over the registry, and `getAppInfo()` fills the rest, so a host reports its real name and version with `unspecified` for the other fields.
- **`{ options }` now reaches the component (Fix).** `application.component(Ctor, { options })` compiled but `MailComponent` and `HealthCheckComponent` ignored it. Both now bind it. Options at the call site win over a key bound earlier; the component's default fills only an unbound key. A component of your own does the same with `extends BaseComponent<YourOptions>` and an `override configure(opts?: YourOptions)` that binds `opts` before calling `super.configure(opts)`.
- **Datasource env variables removed (Breaking).** `APP_ENV_APPLICATION_DS_MIGRATION`, `APP_ENV_APPLICATION_DS_AUTHORIZE`, `APP_ENV_APPLICATION_DS_OAUTH2` and the `APP_ENV_DS_*` spelling never selected anything. They are gone from `EnvironmentKeys` and the startup banner, which no longer has a datasource line. Banner values are now read when the banner runs, so a `.env` loaded in your own entrypoint is honoured.

```ts
application.component(HealthCheckComponent, {
  options: {
    restOptions: { path: '/health' },
    stats: { enable: true, secretKey: process.env.APP_HEALTH_SECRET_KEY },
  },
});
```

## Who is affected

- **Your probe hits `GET /health`.** It gains `timestamp`. `status` is unchanged.
- **You pinned the exact `/health` body in a test.** `toEqual({ status: 'ok' })` now needs `toMatchObject`.
- **You construct or extend `HealthCheckController`.** Its constructor no longer takes `IControllerOptions`. The options and app info arrive through `@inject`, and the path through the `@controller` decorator. `new HealthCheckController({ scope, path })` is now `new HealthCheckController()` after the class has been decorated.
- **You run a dev machine with `NODE_ENV` unset.** `GET /health/stats` is closed. Set `NODE_ENV=development`, or `stats: { enable: true }`.
- **You bind `MailKeys.MAIL_OPTIONS` and also pass `{ options }`.** The registration options now win. Before, they were ignored.
- **You set any `APP_ENV_*_DS_MIGRATION`, `_DS_AUTHORIZE` or `_DS_OAUTH2`.** Delete them.
- **Everyone else.** Nothing. The generator and the stats route are opt-in.

## Details

- Run the built `dist/cjs` file under plain Node and the `git` fields read `unspecified` instead of throwing. Wire the CI variables if a Node invocation has to be exact.
