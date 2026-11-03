---
title: An Open Stats Route Now Says So At Boot
description: stats.enable true with no secretKey stays legal, and now logs one warning naming the route and the environment.
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-12

## An open stats route now says so at boot

<Badge type="tip" text="Enhancement" />

**In one line.** `stats: { enable: true }` with no `secretKey` publishes `GET /health/stats` on every host, and until now it did so silently.

```
WARN [HealthCheckComponent-binding] GET /health/stats is ENABLED with no secretKey on env
"production" - build stamp, runtime version and memory are readable by anything that reaches this
port. Set stats.secretKey, or drop stats.enable and let the environment decide.
```

## What changed

- **One warning at boot.** It fires when the route is mounted (`stats.enable === true`, or `enable` unset on a development `NODE_ENV`), no `stats.secretKey` is configured, and `NODE_ENV` is outside the development environments, including unset.
- **No behaviour change.** `enable: true` without a key still mounts an open route, because on a cluster-internal port that is often right. The framework reports rather than refuses.
- **A blank `secretKey` never warns.** A blank key fails closed.
- **An explicit `enable` skips the environment gate.** The gate only decides when `enable` is unset, so a value added to open the route locally travels with the code to staging and production.

Ways to silence it:

```ts
// the port is public: demand a header
application.component(HealthCheckComponent, {
  options: { stats: { enable: true, secretKey: process.env.APP_ENV_HEALTH_SECRET_KEY } },
});

// or let the environment decide
application.component(HealthCheckComponent, { options: { stats: {} } });
```

## Who is affected

- **`stats.enable: true` and a `secretKey`.** Nothing. No warning.
- **`stats.enable: true`, no key, on a dev machine.** Nothing.
- **`stats.enable: true`, no key, anywhere else.** One warning per application at boot. The route behaves as before.
