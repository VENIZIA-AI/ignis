---
title: Services Prove Themselves to Each Other, Without a Shared Password
description: A built-in service strategy - one short-lived Ed25519 assertion per request, verified against the caller's own published key.
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
- **A service that verifies and nothing else can now boot.** The component used to demand `jwtOptions` or `basicOptions`.
- **The OpenAPI document declares `service`** as an `apiKey` in its own header, not a bearer.

## Who is affected

- **Anyone with services calling services.** This replaces a shared password, and replaces the identity round trip some fleets do on every internal call.
- **Everyone else.** No action needed. Set no `serviceOptions` and no strategy is registered, no route is mounted, nothing changes.

## How it works

The caller signs one assertion per request and sends it in its own header, so the end user's token keeps `Authorization`:

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
| `iss` is a key of `callers` | An unknown service calling at all. The map **is** the allowlist |
| Signature against `createRemoteJWKSet(callers[iss])` | Anyone without the caller's private key |
| `audience` equals this service's `name` | A token minted for one service being replayed at another |
| `typ` is `svc+jwt` | A user token being presented as a service assertion |
| `algorithms: ['EdDSA']` | Algorithm confusion |
| `htm` and `htu` match this request | A capture replayed against a different method or path |

`iss` is read unverified first, only to pick which key set to check the signature against. The same value is then enforced as the expected issuer, so a forged `iss` buys nothing beyond selecting the key set that rejects it.

## Options

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

### The caller does not choose the window

`signLifetimeSeconds` and `acceptMaxAgeSeconds` are deliberately separate, and only the second one is a security control.

A caller already sets `exp` - it signs the token. `acceptMaxAgeSeconds` is the callee's veto over that, and it is the only bound that still holds when a caller is compromised. So it is never something the caller can request. A caller that genuinely needs more slack gets it **named in the callee's config**:

```ts
callers: {
  commerce: 'https://commerce.internal/svc-certs',
  nightlyBatch: { jwksUrl: 'https://batch.internal/svc-certs', acceptMaxAgeSeconds: 600 },
}
```

### What `clockToleranceSeconds` is really for

Not for widening the window - for the opposite direction. Two machines never agree to the second, and a caller whose clock runs one second ahead stamps an `iat` in the future, which jose refuses outright. Measured with `tolerance: 5`: `iat + 5s` is accepted, `iat + 6s` is not.

Widening the window for old tokens is the side effect - and it is why this is a security knob rather than an operational one. With the defaults there are **two** numbers, and they answer different questions:

| | Seconds | Question it answers |
|---|---|---|
| Acceptance window | **65** | What does this machine accept? Age 64 passes, 65 does not |
| Replay window | **70** | How long can a captured assertion be used? A caller running the full tolerance fast mints a token we accept 5s early, then keep accepting for another 64 |

Widening `clockToleranceSeconds` widens the second one second for second.

## What the assertion does NOT cover

Method and path. **Not** the query string, not any header, not the body.

That matters most for tenant selection, which is usually a header or a query parameter. An assertion proves which service called; it does not prove which tenant the call acts on. The caller allowlist and the application's own scoping have to do that.

## Details

### Only PEM keys, deliberately

The signer accepts `format: 'pem'` and refuses `'jwk'`. `importSPKI` rejects a private PEM outright, which makes the private half unreachable from the published document by construction rather than by care.

The JWK format cannot offer that: `importJWK` imports whatever it is handed, and a private JWK marked `"ext": true` round-trips its `d` into the served document. The JWKS issuer guards against exactly this; the service path avoids needing the guard.

### A misconfigured caller name fails closed, and loudly

An `iss` absent from `callers` is refused before any network call, so a caller name can never steer the key-set fetch at an arbitrary host. Membership is tested with `Object.hasOwn`, not a truthiness check - `iss: "constructor"` would otherwise walk a prototype-chain lookup straight past the allowlist.

| File | Package |
|------|---------|
| `src/base/auth/authenticate/common/` | kernel |
| `src/components/auth/authenticate/services/service/` | core |
| `src/components/auth/authenticate/strategies/service.strategy.ts` | core |
| `src/components/auth/authenticate/controllers/service-certs/` | core |
