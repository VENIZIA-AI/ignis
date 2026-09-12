---
title: A Build Stamps Itself, And Health Answers Twice
description: ignis-build-info generates a build stamp every host can bake in; GET /health stays minimal and public while GET /health/stats reports build, process and memory behind a gate; and the datasource env variables that never selected anything are removed.
---

# Changelog - 2026-09-11

## A build stamps itself, and health answers twice

<Badge type="tip" text="Feature" />

**In one line.** A service could not say which commit it was running, and `GET /health` answered
`{ "status": "ok" }` - enough for a probe, useless for an incident.

Two pieces, usable apart:

1. `ignis-build-info` generates the stamp at build time.
2. `GET /health/stats` reports it, with process and memory, behind a gate.

## The stamp is pushed in, never read back out

```bash
# a backend service - a static const a bundler bakes into the output
ignis-build-info generate --out src/_build_info.ts

# a Vite app or a Tauri shell - the same record as JSON
ignis-build-info generate --out public/build-info.json --format json
```

```ts
// src/index.ts - one line at the entrypoint
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });
```

**Nothing is read at run time.** No `readFileSync`, no `spawn('git')`. That is the whole design:
a `bun build --compile` binary ships no `node_modules`, no `.git` and no readable `package.json`, and
a Distroless image has no `git` to spawn - a resolver that looked for any of them would report blanks
in exactly the deployment where the stamp matters most. `BuildInfoRegistry` is the same
`globalThis` + `Symbol.for` slot `ProjectRootRegistry` and `ModuleUtility.register` already use, so
two copies of the package in one process still see one stamp.

The generator resolves each field from CI first, then `git`, then the manifest:

|Field|CI variable|Fallback|
|---|---|---|
|`version`|`APP_ENV_BUILD_VERSION`, `APP_BUILD_VERSION`, `CI_COMMIT_TAG`, `GITHUB_REF_NAME`|`package.json#version`|
|`commit`|`APP_ENV_BUILD_COMMIT_TAG`, `APP_BUILD_COMMIT`, `CI_COMMIT_SHA`, `GITHUB_SHA`|`git rev-parse --short=12 HEAD`|
|`branch`|`APP_BUILD_BRANCH`, `CI_COMMIT_REF_NAME`, `GITHUB_REF_NAME`|`git rev-parse --abbrev-ref HEAD`|
|`builtAt`|`APP_ENV_BUILD_DATE`, `APP_BUILD_DATE`|the moment the generator ran|
|`service`|-|`package.json#name`|

The `APP_ENV_` spellings are read first, then the generic `APP_BUILD_` ones, then whatever the CI
provider exports. Anything left reads `unspecified` - a field a pipeline forgot to wire is visible
as such, not silently absent.

`git` is invoked through **Bun Shell** (`Bun.$`), from `--root` rather than the process cwd, and its
exit code is honoured: a repository with no commit yet prints the literal `HEAD` on stdout while
exiting 128, and that must not become a branch name. `BuildInfoResolver.resolve` and
`generateBuildInfo` are therefore `async` - Bun Shell has no synchronous form.

Both bins carry a `bun` shebang, so this is the normal path. Run the built `dist/cjs` file under
plain **Node** and `Bun.$` is undefined: the `git` fields read `unspecified` and the build still
succeeds, rather than throwing. Wire the CI variables above if a Node invocation has to be exact.

Both CLIs now live in `packages/boot/src/clis/` - `artifacts.ts` for `ignis-artifacts`,
`build-info.ts` for `ignis-build-info`. Only the source layout moved; the bin names and their
flags are unchanged.

## `GET /health` is unchanged in spirit, and now carries the clock

```json
{ "status": "ok", "timestamp": "2026-09-11T07:30:00.000Z" }
```

That is all it will ever answer. A liveness probe needs no more, and `timestamp` is the one addition
that costs nothing to disclose while catching the failure that hides behind every JWT and HMAC
mystery: a server whose clock has drifted.

## `GET /health/stats` is the diagnostic one, and it is closed unless the host is a dev machine

```json
{
  "status": "ok",
  "timestamp": "2026-09-11T07:30:00.000Z",
  "build": {
    "service": "@nx/sale", "version": "1.4.2",
    "commit": "8f80b2a90d12", "branch": "develop",
    "builtAt": "2026-09-10T15:00:00.000Z"
  },
  "process": { "pid": 42, "uptime": 3600.5, "uptimeHuman": "1h 0m 0s", "runtime": "bun 1.4.2", "environment": "production" },
  "memory": { "rss": "64.2 MB", "heapUsed": "32.1 MB", "heapTotal": "48.0 MB" }
}
```

**Default: open only in a development environment, closed everywhere else.** With no `enable`
set, the route is mounted only when `NODE_ENV` is one of `Environment.DEVELOPMENT_ENVS` (`local`,
`debug`, `development`, `dev`, `sit`). `staging`, `uat`, `production`, an unrecognised name and an
**unset** `NODE_ENV` all keep it shut - the same fail-closed rule `AppErrorMiddleware` applies
before it lets a stack trace leave the server. The runtime version and the release this route names
are precisely what an attacker uses to pick an exploit, so "cannot prove it is a dev machine" reads
as production.

```ts
application.component(HealthCheckComponent, {
  options: {
    restOptions: { path: '/health' },
    stats: { enable: true, secretKey: process.env.APP_HEALTH_SECRET_KEY },
  },
});
```

- `enable: false` leaves the route **unmounted**, not merely empty.
- `secretKey` set: the route answers only for a request carrying it in `X-Health-Key`.
- A missing or wrong key gets **404, not 401** - an unauthorised caller must not learn the route
  exists.
- No `secretKey` leaves the route open to whatever can reach the port. Stated here rather than
  implied: on a cluster-internal port that is often the right call, on a public one it is not.
- A `secretKey` that is set but blank fails **closed**. A blank key is a pipeline that forgot to
  export the variable, and reading that as "no key" would publish the route the operator meant to
  lock.
- The gate is per **container**, not per process: the controller receives the options and the app
  info through `@inject`, so two applications in one process - IGNIS nests them - each keep their
  own gate.

## It works with no tooling at all

`stats.buildInfo` (explicit) wins over the registry, and `getAppInfo()` fills whatever neither
carries. A host that never ran the generator still reports its real name and version, because
`getAppInfo()` is something every IGNIS application already implements:

```json
"build": {
  "service": "@nx/sale", "version": "0.0.1-0",
  "commit": "unspecified", "branch": "unspecified", "builtAt": "unspecified"
}
```

## `{ options }` at registration now reaches the component

<Badge type="warning" text="Fix" />

The [2026-09-10 change](./2026-09-10-configuration-and-component-options) added
`application.component(Ctor, { options })` and documented it against `MailComponent` - but the base
`configure(options)` only logs its argument, and neither `MailComponent` nor `HealthCheckComponent`
consumed it. The knob compiled and did nothing: `MailComponent` still threw
`Mail options not configured`, and the health example above would have left the route on its
default.

Both now declare their options generic and override `configure()` to bind what they are handed.
Precedence is by explicitness: options at the call site win over a key bound earlier, and the
component's own default fills only an unbound key.

```ts
application.component(MailComponent, {
  options: { provider: 'amazon-ses', config: { region: 'ap-southeast-1' }, from: 'noreply@x.io' },
});
```

A component you wrote that wants the same knob does the same two things: `extends
BaseComponent<YourOptions>` and an `override configure(opts?: YourOptions)` that binds `opts` before
calling `super.configure(opts)`.

## The datasource env variables are gone, and the banner reads at boot

<Badge type="danger" text="Breaking" />

`EnvironmentKeys` declared `APP_ENV_APPLICATION_DS_MIGRATION`; every example `.env`, the
configuration reference and every deployment manifest set it. The only reader - one startup log
line - read `APP_ENV_DS_MIGRATION`, a name that appears nowhere else. So the banner printed
`postgres` on every host and no correct configuration changed it.

The name was the smaller half of the problem. **Nothing resolved a datasource from either
variable** - they named one in a log line and nowhere else. A setting that cannot change behaviour
is not a setting, so all of it is removed:

- `APP_ENV_APPLICATION_DS_MIGRATION`, `APP_ENV_APPLICATION_DS_AUTHORIZE`,
  `APP_ENV_APPLICATION_DS_OAUTH2` and the `APP_ENV_DS_*` spelling: **deleted**, from
  `EnvironmentKeys`, from the banner and from every example `.env`.
- The `Datasource | Migration: ... | Authorize: ...` banner line is gone with them.
- A datasource is chosen the way it always actually was: register it, resolve its binding key.

Two things came out of the same audit:

- **Every banner value is now read when the banner runs**, not destructured at module load. An
  application that loads its `.env` in its own entrypoint - after `base.ts` is imported - used to
  get the defaults printed back at it.
- **`EnvironmentKeys` now says, per constant, whether IGNIS reads it.** Twelve of the seventeen
  remaining names are conventions for your own code and change nothing in the framework. That was
  never written down, and this bug is what it cost.

## Who is affected

**Your probe hits `GET /health`.** It gains a `timestamp` field. `status` is unchanged, so a probe
matching on it keeps passing.

**You pinned the exact `/health` body in a test.** `toEqual({ status: 'ok' })` now needs
`toMatchObject`.

**You construct or extend `HealthCheckController` yourself.** Its constructor no longer takes
`IControllerOptions`; the options and the application info arrive through `@inject`, and the path
through the `@controller` decorator the component applies. `new HealthCheckController({ scope, path })`
is now `new HealthCheckController()` after the class has been decorated.

**You run a dev machine with `NODE_ENV` unset.** `GET /health/stats` is closed there. Set
`NODE_ENV=development`, or `stats: { enable: true }`.

**You bind `MailKeys.MAIL_OPTIONS` AND pass `{ options }` at registration.** The registration
options now win. Before, they were ignored.

**You set any `APP_ENV_*_DS_MIGRATION` / `_DS_AUTHORIZE` / `_DS_OAUTH2`, in either spelling.**
Delete them. They never selected anything; the framework no longer declares or reads them, and the
startup banner no longer has a datasource line.

**Everything else.** Nothing. The generator and the stats route are opt-in.
