---
title: ServerInfoComponent serves the server time at GET /server/info/time
description: "A new public route for clients that need the server clock. It returns the date, time, epoch, time zone and UTC offset from one instant, and sends Cache-Control no-store."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-10

## ServerInfoComponent serves the server time at GET /server/info/time

<Badge type="tip" text="New Feature" />

**In one line.** `ServerInfoComponent` mounts `GET /server/info/time`, a public route a client can call to read the server clock and work out its own clock skew. It is separate from `HealthCheckComponent`, so locking `/health/*` away does not break it.

## What changed

- **New component.** `this.component(ServerInfoComponent)` mounts `GET /server/info/time`. No authentication. The response sends `Cache-Control: no-store`.
- **One consistent body.** `server` (`date`, `time`, `epoch`, `iso` in the server time zone), `tz`, and `utc` (`offset`, `minutes`, `iso`) all come from one instant.
- **Compute skew from `server.epoch`.** `skew ≈ server.epoch − (t0 + t1) / 2`, with `t0` the send time and `t1` the receive time. The `Date` header is not a substitute: one-second precision, and a proxy can rewrite it.
- **`utc.minutes` is positive east of UTC.** `420` for `+07:00`. This is the opposite sign of `Date.prototype.getTimezoneOffset()`.
- **Configurable path.** `restOptions.path` in `IServerInfoOptions`, default `/server/info`.
- **Public by design.** The component carries only data that is safe to publish: no version, runtime, pid, memory or environment. Those stay in the gated `/health/stats`.

## Who is affected

- **Apps that do not register the component.** No action needed. Nothing changes.
- **Apps that want a client clock check.** Register `ServerInfoComponent` and make sure the gateway exposes the path. See [Server Info](/extensions/components/server-info).

## Details

```typescript
this.component(ServerInfoComponent);
// or, on another path:
this.component(ServerInfoComponent, { options: { restOptions: { path: '/clock' } } });
```
