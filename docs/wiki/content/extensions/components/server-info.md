# Server Info

Public routes that tell a client something about the server. Today there is one: `GET /server/info/time`, the server clock. A browser or mobile client reads it to find out how far its own clock is off.

> [!IMPORTANT]
> Everything under `/server/info/*` is **public by design**: no authentication, no secret key. The component carries only data that is safe to publish and does not help an attacker. No version, runtime, pid, memory or environment ever goes here - those stay in the gated [`/health/stats`](./health-check).

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `ServerInfoComponent` |
| **Controller** | `ServerInfoController` |
| **Reporter** | `ServerInfoReporter` - builds the time body, reusable from your own routes |
| **Options** | `IServerInfoOptions`, bound at `ServerInfoBindingKeys.SERVER_INFO_OPTIONS` |
| **Runtimes** | Both |

#### Import Paths
```typescript
import { ServerInfoComponent, ServerInfoBindingKeys, ServerInfoReporter } from '@venizia/ignis';
import type { IServerInfoOptions, IServerTime } from '@venizia/ignis';
```

## In one example

```typescript
import { BaseApplication, ServerInfoComponent, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(ServerInfoComponent);
  }
}
```

```bash
curl -i localhost:3000/server/info/time
# cache-control: no-store
```

```json
{
  "server": {
    "date": "2026-11-10",
    "time": "15:00:00.123",
    "epoch": 1794297600123,
    "iso": "2026-11-10T15:00:00.123+07:00"
  },
  "tz": "Asia/Ho_Chi_Minh",
  "utc": { "offset": "+07:00", "minutes": 420, "iso": "2026-11-10T08:00:00.123Z" }
}
```

## Response fields

Every field comes from one captured instant, so they always agree.

| Field | Meaning |
|-------|---------|
| `server.date` | Calendar date in the server time zone, `YYYY-MM-DD` |
| `server.time` | Wall-clock time in the server time zone, `HH:mm:ss.SSS` |
| `server.epoch` | Milliseconds since 1970-01-01T00:00:00Z. **Compute clock skew from this field.** |
| `server.iso` | `date`, `time` and `utc.offset` as ISO-8601, e.g. `2026-11-10T15:00:00.123+07:00` |
| `tz` | IANA time zone the server process resolved (`TZ`, or the host setting) |
| `utc.offset` | Offset of `tz` from UTC at response time, `+07:00` style |
| `utc.minutes` | The same offset in minutes, **positive east of UTC**: `420` for `+07:00`, `-300` for `-05:00` |
| `utc.iso` | The same instant in UTC, ISO-8601 with milliseconds |

> [!WARNING]
> The sign of `utc.minutes` is the **opposite** of JavaScript's `Date.prototype.getTimezoneOffset()`, which counts minutes west of UTC (`-420` for `+07:00`). Do not add the two together.

The offset is read at the response instant, so a daylight saving change moves it. The route sends `Cache-Control: no-store`: a cached time is a wrong time, and no cache or service worker may serve it.

## Read the server time and the clock skew

Measure the round trip, then assume the server stamped its answer halfway through it:

```typescript
const t0 = Date.now();
const response = await fetch('/server/info/time');
const t1 = Date.now();

const { server } = await response.json();

// skew ≈ server.epoch − (t0 + t1) / 2
const skewMs = server.epoch - (t0 + t1) / 2;
const serverNow = () => Date.now() + skewMs;
```

- `skewMs > 0`: the client clock is behind the server.
- `skewMs < 0`: the client clock is ahead.
- The error is at most half the round trip, `(t1 - t0) / 2`. Repeat the request a few times and keep the sample with the shortest round trip.
- Use `Date.now()` for `t0` and `t1`, the same clock `server.epoch` is measured against. Do not mix in `performance.now()`.

### Why not the `Date` response header

Every HTTP response carries a `Date` header. It is the wrong tool here:

- It has **one-second precision**, so skew under a second is invisible.
- A **proxy or CDN may rewrite it** (or serve it from cache), so it can describe the proxy, not your server.

## Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `restOptions.path` | `string` | `'/server/info'` | Base path the routes mount under |

```typescript
this.component(ServerInfoComponent, {
  options: { restOptions: { path: '/clock' } },
});
// GET /clock/time
```

A partly filled options binding falls back to the default for each missing field. Options passed to `this.component(...)` win over a binding made earlier.

## Gateway

The route sits behind whatever path the application configures. A reverse proxy or API gateway must expose that path to clients, or they cannot read the time. Client features depend on this route, not on `/health/*`, because operators may lock `/health/*` away.

## Adding a route here

Anything a new route answers needs the component's rule: safe to publish, no help to an attacker. If a field would help someone pick an exploit or map the host, it belongs in the gated [`/health/stats`](./health-check) instead.
