# Health Check

Two endpoints with two audiences. `GET /health` is the minimal liveness answer a load balancer or a
Kubernetes probe polls - status and the server clock, nothing more. `GET /health/stats` is the
diagnostic one an operator opens during an incident - build stamp, process and memory - and it is
closed on every host that cannot prove it is a development machine.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `HealthCheckComponent` |
| **Controller** | `HealthCheckController` |
| **Reporter** | `HealthCheckReporter` - assembles both answers, reusable from your own routes |
| **Runtimes** | Both |

#### Import Paths
```typescript
import { HealthCheckComponent, HealthCheckBindingKeys, HealthCheckHeaders } from '@venizia/ignis';
import type { IHealthCheckOptions } from '@venizia/ignis';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';
```

## In one example

Register the component with no configuration - `GET /health` and `POST /health/ping` are live
immediately, and `GET /health/stats` is live when `NODE_ENV` names a development environment.

```typescript
import { HealthCheckComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(HealthCheckComponent);
  }
}
```

```bash
curl localhost:3000/health
# { "status": "ok", "timestamp": "2026-09-11T07:30:00.000Z" }
```

## How it works

- **`GET /health` discloses nothing.** `status` and `timestamp` only. The clock is the one addition
  that costs nothing to disclose while catching the failure behind every JWT and HMAC mystery: a
  server whose time has drifted.
- **`GET /health/stats` is gated twice.** First by `stats.enable`, decided when the controller is
  bound - a disabled route is **unmounted**, not empty, so it is absent from the OpenAPI document
  too. Second by `stats.secretKey`, checked per request against the `X-Health-Key` header.
- **The default is closed.** With no `enable` set, the route is mounted only when `NODE_ENV` is one
  of `Environment.DEVELOPMENT_ENVS` (`local`, `debug`, `development`, `dev`, `sit`). `staging`,
  `uat`, `production`, an unrecognised name and an unset `NODE_ENV` all keep it shut - the same
  fail-closed rule `AppErrorMiddleware` uses to decide whether a stack trace may leave the server.
- **A refusal is a 404, and byte-identical to an unmounted route.** A wrong or missing key runs the
  application's own notFound handler rather than throwing, so the answer cannot confirm the route
  exists. A `secretKey` that is set but blank fails closed too.
- **The build stamp is pushed in, never read at run time.** The reporter never opens a file and
  never spawns `git`. It reads `stats.buildInfo` first, then `BuildInfoRegistry` (populated at your
  entrypoint from the file `ignis-build-info generate` wrote), then the application's own
  `getAppInfo()`. A host that ran no generator still reports its real name and version; anything
  unknowable reads `unspecified`.
- **The gate is per application, not per process.** The controller receives its options and the
  application info through `@inject`, so two applications in one process - IGNIS nests them - each
  keep their own gate.
- **Auto-registered controller.** `HealthCheckComponent.binding()` applies `@controller({ path })`
  via `Reflect.decorate` at runtime, then calls `this.application.controller(HealthCheckController)`.
  The path comes from the options binding, not a hardcoded class decorator.
- **The default binding wins the race if you're late.** The constructor pre-binds
  `HEALTH_CHECK_OPTIONS` via `initDefault`, filling only an unbound key. A custom binding must exist
  BEFORE `this.component(HealthCheckComponent)` runs.

## Common tasks

### Open the stats route in production behind a key

```typescript
this.component(HealthCheckComponent, {
  options: {
    restOptions: { path: '/health' },
    stats: { enable: true, secretKey: process.env.APP_HEALTH_SECRET_KEY },
  },
});
```

```bash
curl -H 'X-Health-Key: ...' localhost:3000/health/stats
```

```json
{
  "status": "ok",
  "timestamp": "2026-09-11T07:30:00.000Z",
  "build": {
    "service": "@nx/sale", "version": "1.4.2",
    "commit": "8f80b2a90d12", "branch": "develop",
    "builtAt": "2026-09-10T15:00:00.000Z"
  },
  "process": {
    "pid": 42, "uptime": 3600.5, "uptimeHuman": "1h 0m 0s",
    "runtime": "bun 1.4.2", "environment": "production"
  },
  "memory": { "rss": "64.2 MB", "heapUsed": "32.1 MB", "heapTotal": "48.0 MB" }
}
```

Without `secretKey` the route is open to whatever can reach the port. On a cluster-internal port that
is often the right call; on a public one it is not.

### Stamp the build so `stats.build` names a real commit

```bash
# in the service's build script, before the bundle step
ignis-build-info generate --out src/_build_info.ts
```

```typescript
// src/index.ts - one line at the entrypoint
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });
```

The generator reads `APP_ENV_BUILD_VERSION` / `APP_ENV_BUILD_COMMIT_TAG` / `APP_ENV_BUILD_DATE`
first, then the generic `APP_BUILD_*` and provider-specific variables, then `git`, then
`package.json`. See the [`@venizia/ignis-boot` reference](/references/base/bootstrapping).

### Customize the health check path
Bind `IHealthCheckOptions` BEFORE registering the component - order matters (see above).

```typescript
import { HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

this.bind<IHealthCheckOptions>({
  key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
}).toValue({ restOptions: { path: '/health-check' } });

this.component(HealthCheckComponent); // AFTER the bind
```

### Call the ping endpoint
`POST /health/ping` echoes `message` back with a server timestamp - useful for round-trip latency
checks and body-parsing smoke tests.

```bash
curl -X POST localhost:3000/health/ping \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}'
# { "type": "PONG", "date": "2026-02-11T12:00:00.000Z", "message": "hello" }
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `type` | `string` | No | Defaults to `"PING"` |
| `message` | `string` | Yes | Min 1, max 255 characters |

## Reference

### Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.path` | `string` (optional) | `'/health'` | Base path for every health endpoint |
| `stats.enable` | `boolean` (optional) | open only in `Environment.DEVELOPMENT_ENVS` | Mounts `GET <path>/stats`. `false` unmounts it. A non-boolean (a config-derived `"false"`) is ignored and the environment default applies |
| `stats.secretKey` | `string` (optional) | none - route open | Required in `X-Health-Key`. A blank value fails closed |
| `stats.buildInfo` | `IBuildInfo` (optional) | `BuildInfoRegistry.get()` | Wins over the registry; a host that stamps its own build passes it here |

```typescript
interface IHealthCheckOptions {
  restOptions?: { path?: string };
  stats?: {
    enable?: boolean;
    secretKey?: string;
    buildInfo?: IBuildInfo;
  };
}
```

### Binding keys
| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/health-check/options` | `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` | `IHealthCheckOptions` | No | `{ restOptions: { path: '/health' } }` |
| `@app/health-check/application-info` | `HealthCheckBindingKeys.APPLICATION_INFO` | `IApplicationInfo` | No - bound by the component | the application's `getAppInfo()` |

### Headers
| Constant | Value | Used by |
|----------|-------|---------|
| `HealthCheckHeaders.SECRET_KEY` | `x-health-key` | `GET /health/stats` when `stats.secretKey` is set |

### REST paths
| Constant | Value | Full path (default) |
|----------|-------|---------------------|
| `HealthCheckRestPaths.ROOT` | `/` | `GET /health` |
| `HealthCheckRestPaths.STATS` | `/stats` | `GET /health/stats` |
| `HealthCheckRestPaths.PING` | `/ping` | `POST /health/ping` |

Paths are relative to the base path configured in `IHealthCheckOptions.restOptions.path`.

### API endpoints
| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/health` | Liveness | `{ "status": "ok", "timestamp": "..." }` |
| `GET` | `/health/stats` | Build stamp, process, memory - gated | see above; `404` when unmounted or refused |
| `POST` | `/health/ping` | Echo test | `{ "type": "PONG", "date": "...", "message": "..." }` |

### The reporter
`HealthCheckReporter` is exported so a host with its own health route can answer the same shapes:

| Method | Returns |
|--------|---------|
| `buildSummary()` | `{ status, timestamp }` |
| `buildStats({ options, appInfo })` | the full `/health/stats` body |
| `resolveBuildInfo({ options, appInfo })` | the resolved `build` block, every field a string |
| `isStatsEnabled({ options })` | the mount decision |
| `isStatsAuthorized({ options, header })` | the per-request decision |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `GET /health` returns 404 | `HealthCheckComponent` not registered, or registered after controllers were already mounted | Call `this.component(HealthCheckComponent)` in `preConfigure()` |
| `GET /health/stats` returns 404 on staging | The default is closed outside the development environments | Set `stats: { enable: true, secretKey }` explicitly |
| `GET /health/stats` returns 404 with the right key | `secretKey` is blank, or arrived as a non-string from config | Export the variable; the gate fails closed on a blank or wrong-typed key |
| `build.commit` reads `unspecified` | No stamp was registered and `getAppInfo()` carries no commit | Run `ignis-build-info generate` in the build and call `BuildInfoRegistry.set` at the entrypoint |
| Custom path not applied | Custom `IHealthCheckOptions` bound AFTER `this.component()` ran | Bind options BEFORE calling `this.component(HealthCheckComponent)` |
| `POST /health/ping` returns a validation error | `message` is missing, or exceeds 255 characters | Send a `message` string between 1 and 255 characters |

## See also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Application](/guides/core-concepts/application/) - Registering components

- **Components:**
  - [All Components](./index) - Built-in components list

- **Changelog:**
  - [A Build Stamps Itself, And Health Answers Twice](/changelogs/2026-09-11-build-info-and-health-stats)

- **Best Practices:**
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production monitoring

**Files:**

- [`packages/core-server/src/components/health-check/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/component.ts) - `HealthCheckComponent`
- [`packages/core-server/src/components/health-check/controller.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/controller.ts) - `HealthCheckController`
- [`packages/core-server/src/components/health-check/reporter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/reporter.ts) - `HealthCheckReporter`
- [`packages/core-server/src/components/health-check/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/common/types.ts) - `IHealthCheckOptions`
- [`packages/core-server/src/components/health-check/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/common/keys.ts) - `HealthCheckBindingKeys`
- [`packages/core-server/src/components/health-check/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/common/constants.ts) - `HealthCheckHeaders`
- [`packages/core-server/src/components/health-check/common/rest-paths.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/common/rest-paths.ts) - `HealthCheckRestPaths`
- [`packages/helpers/src/utilities/build-info.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/build-info.utility.ts) - `BuildInfoRegistry`
