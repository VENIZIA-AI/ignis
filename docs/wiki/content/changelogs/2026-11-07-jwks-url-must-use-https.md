---
title: A JWKS URL must use https, unless its host is named
description: "A JWKS URL with http: is refused at boot unless its host is loopback or listed by name in jwks.hosts.http. The rule covers the JWKS verifier and the service-assertion callers."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-07

## A JWKS URL must use https, unless its host is named

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A key set fetched over plain `http:` can be replaced on the way, and whoever replaces it signs tokens that verify. A `jwksUrl` is now `https:`, unless its host is loopback or you name it in `jwks.hosts.http`.

## What changed

- **`https:` by default.** The `jwksUrl` of a JWKS verifier and the `jwksUrl` of every service-assertion caller must be `https:`. Any scheme other than `http:` and `https:` is refused.
- **Loopback is always allowed.** `localhost`, `127.0.0.0/8` and `::1` may use `http:`.
- **Named hosts.** `jwks.hosts.http` lists host names that may use `http:`, for example `['identity-service']` for a service inside a private network. Names only: the port is ignored, so one entry covers every port. An entry with a port, a scheme, a path, a wildcard or an IP address refuses the boot, naming the entry.
- **No private-network rule.** What a name resolves to can change, so there is no automatic exception for private addresses. The opt-in is by name.
- **One rule, two places.** The JWKS verifier takes `options.jwks.hosts.http`, and the service-assertion options take `jwks.hosts.http`, which covers every caller.
- **What counts as a host name.** Labels of letters, digits and hyphens joined by single dots: `identity-service`, `auth.internal`. An entry that the URL parser would rewrite is refused too (`2130706433`, `0x7f000001`, `1.2.3`, `a..b`), and so is one with a leading or trailing dot. A host written with a trailing dot (`http://identity-service./certs`) does not match the entry `identity-service`.
- **No address can be allowed.** A plain-http JWKS on an IP address that is not loopback (`http://10.0.0.5/certs`) cannot be listed; use a host name or `https:`. The numeric spellings of loopback (`http://2130706433/`, `http://0x7f.1/`) are loopback, as the parser writes them. Only `::1` is loopback among the IPv6 forms: `[::ffff:127.0.0.1]` is refused.
- **Redirects are not followed.** The key set fetch does not follow a redirect (jose reads only a `200`), so an `https:` URL cannot lead to an `http:` host. A JWKS URL that redirects fails verification: give the final URL.
- **Boot and fetch.** The application checks every URL when it starts, and the services check again before they fetch. A refusal names the key and the host, never the URL, which may carry credentials, and the verifier logs the origin of its JWKS URL only.

## Who is affected

- **Apps with a plain-http JWKS URL to a host that is not loopback.** They stop booting. Use `https:`, or name the host in `jwks.hosts.http`. A plain-http URL to an IP address that is not loopback cannot be allowed at all: give it a host name.
- **Apps that call each other inside a private network over http.** Add the callers' host names to `jwks.hosts.http` of the service options.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> An application with a plain-http JWKS URL to a host that is neither loopback nor named does not boot.

**Before:**

```typescript
// JWKS verifier
options: { mode: JWKSModes.VERIFIER, jwksUrl: 'http://identity-service:3000/certs', /* ... */ }

// Service assertions
{ name: 'inventory', callers: { commerce: 'http://commerce:3000/svc-certs' }, /* ... */ }
```

**After:**

```typescript
// JWKS verifier
options: {
  mode: JWKSModes.VERIFIER,
  jwksUrl: 'http://identity-service:3000/certs',
  jwks: { hosts: { http: ['identity-service'] } },
  /* ... */
}

// Service assertions: one list for every caller
{
  name: 'inventory',
  callers: { commerce: 'http://commerce:3000/svc-certs' },
  jwks: { hosts: { http: ['commerce'] } },
  /* ... */
}
```

Prefer `https:` where you can; the list is for a private network you trust.

## Details

| File | Package |
|------|---------|
| `src/base/auth/authenticate/common/types/jwt.ts` | kernel |
| `src/base/auth/authenticate/common/types/service.ts` | kernel |
| `src/components/auth/authenticate/services/jwks-url-policy.ts` | core |
| `src/components/auth/authenticate/component.ts` | core |
