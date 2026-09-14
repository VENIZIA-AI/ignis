---
title: The Stats Key Header Shows Up In The API Reference
description: GET /health/stats now declares x-health-key in its OpenAPI definition, so the API reference renders an input for it instead of answering 404 with no way to send the key.
---

# Changelog - 2026-09-14

## The stats key header shows up in the API reference

<Badge type="tip" text="Enhancement" />

**In one line.** `GET /health/stats` declares `x-health-key` as a header parameter, so the API
reference renders a box for it.

Before this, a host that set `stats.secretKey` locked the route behind a header the reference never
offered. Opening `/health/stats` from the explorer returned `404` with no way to send the key, and
the `404` is deliberate - an unauthorised caller must not learn the route exists - so the reference
gave no hint about what was missing.

## The header stays optional

A host with no `stats.secretKey` runs an open stats route and needs no key. Marking the parameter
required would make the reference lie to that host, so it is declared optional and the description
carries the condition:

```
x-health-key   string, optional
The stats key. A host that configures `stats.secretKey` answers 404 without it.
```

## Who is affected

**You set `stats.secretKey`.** The reference now has a box for the key. Nothing changes on the wire.

**You run an open stats route.** One optional parameter appears in the reference. Requests are
unaffected - the value is never read when no key is configured.

**You call the route from code.** Nothing changes. The header name, the gate and the `404` are the
same.

**Files:**

- [`packages/core-server/src/components/health-check/controller.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/controller.ts) - `RouteConfigs.STATS`
- [`packages/core-server/src/components/health-check/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/health-check/common/constants.ts) - `HealthCheckHeaders.SECRET_KEY`
