---
title: An Open Stats Route Now Says So At Boot
description: stats.enable true with no secretKey bypasses the environment gate. It stays legal, and now logs one warning naming the route and the environment.
---

# Changelog - 2026-09-12

## An open stats route now says so at boot

<Badge type="tip" text="Enhancement" />

**In one line.** `stats: { enable: true }` with no `secretKey` publishes `GET /health/stats` on
**every** host, and until now it did so silently.

```
WARN [HealthCheckComponent-binding] GET /health/stats is ENABLED with no secretKey on env
"production" - build stamp, runtime version and memory are readable by anything that reaches this
port. Set stats.secretKey, or drop stats.enable and let the environment decide.
```

## Why an explicit `enable` is the sharp edge

The [environment gate](./2026-09-11-build-info-and-health-stats) only decides when `enable` is
**unset**. An explicit boolean answers first and `NODE_ENV` is never consulted - which is the point
of an explicit setting, and also the trap. A value added to open the route for a local run travels
with the code to staging and production.

This was found in a real consumer, on a live deployment, by reading the two gate functions against
each other. `curl` on their development host returned `200` with the service version, `runtime`,
`NODE_ENV` and the memory profile, unauthenticated.

## It stays legal

No behaviour changed. `enable: true` without a key still mounts an open route, because on a
cluster-internal port that is often exactly right, and only the operator knows whether the port is
reachable. The framework cannot answer that, so it reports rather than refuses.

The warning fires when all three hold:

| Condition | Detail |
|---|---|
| The route is mounted | `stats.enable === true`, or an unset `enable` on a development `NODE_ENV` |
| No key is configured | `stats.secretKey` is `undefined` |
| The host is not provably a dev machine | `NODE_ENV` is outside `DEVELOPMENT_ENVS`, **including unset** |

A **blank** `secretKey` never warns, because a blank key fails closed - the route refuses every
request rather than serving them.

## Two ways to silence it, both correct

```ts
// the port is public: demand a header
application.component(HealthCheckComponent, {
  options: { stats: { enable: true, secretKey: process.env.APP_ENV_HEALTH_SECRET_KEY } },
});

// or let the environment decide, which closes it on staging, uat, production and an unset NODE_ENV
application.component(HealthCheckComponent, { options: { stats: {} } });
```

A third shape worth knowing, used by a consumer to avoid shipping a shared secret to every
deployment file: derive `enable` from whether the key exists, so a host with no key does not mount
the route at all.

```ts
const secretKey = applicationEnvironment.get<string>('APP_ENV_HEALTH_SECRET_KEY');
stats: { enable: Boolean(secretKey), secretKey }
```

## Who is affected

**You set `stats.enable: true` and a `secretKey`.** Nothing. No warning.

**You set `stats.enable: true` and no key, on a dev machine.** Nothing. That is the intended shape.

**You set `stats.enable: true` and no key, anywhere else.** One warning per application at boot. The
route behaves exactly as before - read the line and decide.

**Files:**

- [`packages/core-server/src/components/health-check/reporter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/reporter.ts) - `HealthCheckReporter.isStatsUnguarded`
- [`packages/core-server/src/components/health-check/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/component.ts) - `HealthCheckComponent.binding`
