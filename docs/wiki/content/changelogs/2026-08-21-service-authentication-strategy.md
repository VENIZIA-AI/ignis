---
title: Services Prove Themselves to Each Other, Without a Shared Password
description: A built-in service strategy where each caller signs one short-lived Ed25519 assertion per request, verified against the caller's own published key.
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-21

## `service` is a built-in authentication strategy

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** A calling service signs one short-lived assertion per request; the callee verifies it locally against that caller's published key, with no identity round trip and no shared password.

```ts
// The callee. It is called, so it verifies - and needs no keys of its own.
this.bind<IServiceAuthOptions>({ key: AuthenticateBindingKeys.SERVICE_OPTIONS }).toValue({
  name: 'pricing',
  callers: { commerce: 'https://commerce.internal/svc-certs' },
  resolvePrincipal: async ({ issuer }) => userService.findServiceAccount({ name: issuer }),
});

// The route. `service` is a framework name now, so nothing extra is imported.
@post({ path: '/calculate', authenticate: { strategies: [AuthenticateStrategy.SERVICE] } })
```

## What changed

- **`AuthenticateStrategy.SERVICE` joins `BASIC` and `JWT`.** A route names it with no import beyond `@venizia/ignis`.
- **`serviceOptions`** sits beside `jwtOptions` and `basicOptions` on the authenticate component.
- **`GET /svc-certs`** is mounted automatically, but only on a service that has signing keys.
- **A service that only verifies can now boot.** The component used to demand `jwtOptions` or `basicOptions`.
- **The OpenAPI document declares `service`** as an `apiKey` in its own header, not a bearer.

## Who is affected

- **Anyone with services calling services.** This replaces a shared password, and the identity round trip some fleets do on every internal call.
- **Everyone else.** No action needed. With no `serviceOptions`, no strategy is registered, no route is mounted, and nothing changes.

## Details

The caller sends the assertion in its own header, so the end user's token keeps `Authorization`:

```
x-service-assertion: <EdDSA JWT>

header  { "alg": "EdDSA", "kid": "commerce_svc-certs", "typ": "svc+jwt" }
payload { "iss": "commerce", "aud": "pricing", "sub": "commerce",
          "htm": "POST", "htu": "/v1/api/pricing/calculate",
          "jti": "...", "iat": <now>, "exp": <now + 60> }
```

The callee checks, in order:

| Check | What it stops |
|---|---|
| `iss` is a key of `callers` | An unknown service calling at all. The map is the allowlist |
| Signature against `createRemoteJWKSet(callers[iss])` | Anyone without the caller's private key |
| `audience` equals this service's `name` | A token minted for one service being replayed at another |
| `typ` is `svc+jwt` | A user token being presented as a service assertion |
| `algorithms: ['EdDSA']` | Algorithm confusion |
| `htm` and `htu` match this request | A capture replayed against a different method or path |

An `iss` absent from `callers` is refused before any network call, so a caller name cannot steer the key-set fetch to another host.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `name` | `string` | required | The `iss` this service stamps, and the `aud` it demands |
| `resolvePrincipal` | `(opts) => IAuthUser \| null` | required | Which application principal a verified caller acts as. Return `null` to refuse |
| `keys` | `{ driver, format, private, public, kid? }` | - | Present only on a service that calls out. Absent means verify-only, and no certs route |
| `callers` | `Record<string, string \| { jwksUrl, acceptMaxAgeSeconds? }>` | `{}` | Caller name to its JWKS url. Also the allowlist |
| `signLifetimeSeconds` | `number` | `60` | How long the assertions this service mints stay valid |
| `acceptMaxAgeSeconds` | `number` | `60` | The oldest assertion this service accepts |
| `clockToleranceSeconds` | `number` | `5` | Clock skew allowance |
| `rest.path` | `string` | `/svc-certs` | Where the certs route is mounted |

- **The caller does not choose the window.** `acceptMaxAgeSeconds` is the callee's veto and the only bound that holds if a caller is compromised. A caller that needs more slack gets it named in the callee's config:

```ts
callers: {
  commerce: 'https://commerce.internal/svc-certs',
  nightlyBatch: { jwksUrl: 'https://batch.internal/svc-certs', acceptMaxAgeSeconds: 600 },
}
```

- **`clockToleranceSeconds` is a security setting.** With the defaults, the acceptance window is 65 seconds (age 64 passes, 65 does not) and the replay window is 70 seconds. Widening the tolerance widens the replay window second for second.
- **The assertion covers method and path only.** Not the query string, any header, or the body. It proves which service called, not which tenant the call acts on, so the caller allowlist and your own scoping must do that.
- **Only PEM keys.** The signer accepts `format: 'pem'` and refuses `'jwk'`, so the private half cannot reach the published document.
