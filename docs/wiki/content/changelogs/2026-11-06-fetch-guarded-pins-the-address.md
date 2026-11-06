---
title: UrlIngest.fetchGuarded connects to the address it vetted, and takes a method, headers and a body
description: "fetchGuarded resolves a host once per hop, checks every answer and connects to those addresses, so DNS rebinding cannot reach an internal address. It also sends POST and other methods with headers and a body, for signed webhooks."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## UrlIngest.fetchGuarded connects to the address it vetted, and takes a method, headers and a body

<Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" />

**In one line.** `UrlIngest.fetchGuarded` used to check a host and then let `fetch` look it up again, so a DNS answer that changed in between (DNS rebinding) could reach an internal address. It now connects to the address it checked. It also sends `POST` and other methods with headers and a body, so a signed webhook can use it.

## What changed

- **Pinned connection.** The host is resolved once per hop and every answer is checked. The request connects to those addresses and no other, in order; a connect error moves to the next vetted address. The `Host` header and, for https, the TLS server name stay the url's own, so the certificate is still verified for the name you asked for. A `Host` in `headers` is ignored. Every redirect hop is resolved, checked and pinned again.
- **`method`, `headers`, `body`.** `fetchGuarded({ url, method, headers, body })`; `body` is text or bytes. The redirect, size and timeout guards still apply. A GET or HEAD with a body is refused.
- **Redirects with a body.** A 301 or 302 on a POST, and a 303, become a GET without the body. A 307 or 308 repeats the request; with a body it is refused when it leaves the origin, so a signed payload is never replayed to a host a redirect chose. `authorization`, `cookie` and `proxy-authorization` are dropped when a hop changes origin.
- **Proxies.** The environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored on a pinned connection, because a proxy resolves the name itself and would undo the pin. `policy.proxy` sends the request through a proxy you chose on purpose; the address check still runs, the connection is not pinned.
- **Left as before.** `assertPublicHost` and `assertReachableUrl` called on their own only check, so a later connect of your own can still be rebound: connect through `fetchGuarded`. `allowPrivateAddress` turns the guard, and the pin, off.

## Who is affected

- **Code that fetches an untrusted url through `fetchGuarded` or `AssetIngest.fromUrl`.** The connection is pinned now; nothing to change.
- **Code that relied on the environment proxy for `fetchGuarded`.** Pass `policy.proxy` instead.
- **Apps that wrote their own check-then-fetch for webhooks.** They can call `fetchGuarded` with `method: 'POST'`.

## Details

| File | Package |
|------|---------|
| `src/modules/network/utilities/url-safety/ingest.ts` | helpers |
| `src/modules/network/utilities/url-safety/common/types.ts` | helpers |
