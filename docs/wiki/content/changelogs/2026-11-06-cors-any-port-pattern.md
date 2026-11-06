---
title: CORS origin patterns accept :* for any port, such as http://localhost:*
description: "configs.middlewares.cors.origin takes :* as the port of a pattern, also on an exact host, so a development rule like http://localhost on any port needs no custom matcher."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## CORS origin patterns accept :* for any port, such as http://localhost:*

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `configs.middlewares.cors.origin` takes `:*` as the port of a pattern, so "`http://localhost` on any port" is one entry and an app no longer keeps its own origin function for it.

## What changed

- **Any port.** `http://localhost:*`, `http://127.0.0.1:*` and `https://*.example.com:*` match the host on any port and with no port.
- **Still exact where it matters.** The scheme must be equal. The host is exact for `http://localhost:*`, and for `https://*.example.com:*` it follows the subdomain rules (the apex does not match). `http://localhost.evil.com:3000` and `http://sub.localhost:3000` do not match `http://localhost:*`.
- **A real port number.** What follows the colon in the request must be a number from 1 to 65535 with no leading zero; `http://localhost:abc` and `http://localhost:3000@evil.com` do not match.
- **Refused at boot.** `http://*:*`, `http://local*:*`, `http://[::1]:*` (IPv6 is not supported) and any other shape stop the application from starting with a message naming the pattern. A port written as a number keeps matching exactly.

```typescript
middlewares: {
  cors: {
    origin: ['http://localhost:*', 'http://127.0.0.1:*', 'https://*.example.com'],
  },
},
```

## Who is affected

- **Apps that wrote an origin function for "localhost on any port".** They can switch to the pattern.
- **Everyone else.** No action needed. A pattern without `:*` behaves as before.

> [!WARNING]
> `http://localhost:*` lets any page served from any port on the visitor's own machine call your API. Keep it out of a production configuration.

## Details

| File | Package |
|------|---------|
| `src/base/applications/cors.ts` | kernel |
| `src/base/applications/common/types/middlewares.ts` | kernel |
