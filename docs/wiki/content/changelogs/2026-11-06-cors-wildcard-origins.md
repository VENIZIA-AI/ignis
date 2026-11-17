---
title: CORS accepts a subdomain wildcard origin such as https://*.example.com
description: "configs.middlewares.cors.origin takes a subdomain wildcard, matched by one tested matcher with the scheme and the port compared exactly, so no app writes its own origin regex."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## CORS accepts a subdomain wildcard origin such as https://*.example.com

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `configs.middlewares.cors.origin` takes `https://*.example.com`, matched by one tested matcher, so an app no longer writes an origin regex that is one missing dot or anchor away from allowing `example.com.evil.net`.

## What changed

- **A subdomain wildcard.** A string or a list entry may be `scheme://*.host[:port]`. The `*` is the whole leftmost host label; one or more labels match.
- **Exact scheme and port.** `https://*.example.com` does not match `http://app.example.com` or `https://app.example.com:8443`. Name a port in the pattern to allow it.
- **What does not match.** The apex domain (`https://example.com`, list it next to the pattern), `evilexample.com`, `example.com.evil.net`, and a userinfo or path trick such as `https://evil.com@app.example.com`.
- **Refused at boot.** A wildcard anywhere else (`https://*`, `https://*.com`, `https://app*.example.com`, a pattern with no scheme) stops the application from starting with a message naming the pattern. The bare `'*'` together with `credentials: true` was already refused and still is, alone or inside a list.
- **Credentials work with a pattern.** The matching origin is echoed back, never a `*`.

```typescript
middlewares: {
  cors: {
    origin: ['https://example.com', 'https://*.example.com'],
    credentials: true,
  },
},
```

## Who is affected

- **Apps with a string, a list or a function origin and no `*` in it.** No action needed; they behave as before.
- **Apps with a `*` inside a longer origin string.** It never matched anything before; it now either works as a pattern or refuses to boot with a message that says why.
- **Apps with a hand-written origin function for subdomains.** They can switch to the pattern.

## Details

| File | Package |
|------|---------|
| `src/base/applications/cors.ts` | kernel |
| `src/base/applications/common/types/middlewares.ts` | kernel |
