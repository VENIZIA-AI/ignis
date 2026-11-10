---
type: Architecture
title: Server info component
description: The public server-time route, the rule that keeps it safe to publish, and why it is not part of health-check.
resource: packages/core-server/src/components/server-info
tags: [architecture, components, security, public-route]
---

`ServerInfoComponent` mounts `GET <path>/time` (default `/server/info/time`). It is public: no
authentication, `Cache-Control: no-store`. It mirrors `HealthCheckComponent` (a `common/` with keys,
types and rest-paths, a controller, a reporter, `restOptions.path`, options bound at
`ServerInfoBindingKeys.SERVER_INFO_OPTIONS`).

## The rule

The component carries **only data that is safe to publish and does not help an attacker**: a clock and
a time zone. No version, runtime, pid, memory or environment. Those stay in the gated
`/health/stats`. A new route here must pass the same test; a field that fails it goes to health.

## Why it is not in health-check

Operators may lock `/health/*` away (gateway rule, secret key). A client feature that needs the
server time must not break when they do, so it has its own path and its own component.
`/server/info/*` is public by design.

## Body

`ServerInfoReporter.buildTime` derives every field from ONE captured `Date`: `server.{date,time,epoch,iso}`
in the process time zone, `tz` (resolved IANA zone), `utc.{offset,minutes,iso}`. The offset is read at
that instant (daylight saving moves it) through `Intl.DateTimeFormat`, not from `getTimezoneOffset()`.

- `utc.minutes` is positive east of UTC: the opposite sign of `Date.prototype.getTimezoneOffset()`.
- Clients compute skew from `server.epoch`: `skew ≈ epoch − (t0 + t1) / 2`. The `Date` header is not a
  substitute (second precision, proxies rewrite it).

## Related

- [Component model](/architecture/component-model.md)
- [Adding a component](/process/adding-a-component.md)
