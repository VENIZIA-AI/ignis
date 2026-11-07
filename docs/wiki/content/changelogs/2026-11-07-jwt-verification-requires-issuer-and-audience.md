---
title: JWT verification requires an issuer and an audience
description: "Every JWS and JWKS configuration needs claims: { issuer, audience }. IGNIS stamps both on every token it signs, requires both on every token it verifies, and pins the accepted algorithm."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-07

## JWT verification requires an issuer and an audience

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Bearer and JWKS verification checked only the signature and the expiry, so a token signed with the same key for another purpose (a password-reset or invite token that carries a user id) authenticated a request. Every JWT configuration now needs `claims: { issuer, audience }`, and a configuration without it does not boot.

## What changed

- **`claims` is required.** `claims.issuer` and `claims.audience` (a string, or a list for `audience`) are stamped on every token IGNIS signs and required on every token it verifies. A token without them, or with other values, is refused with `401`.
- **Strict.** `claims` accepts these two keys only. A misspelt key (`audiance`) refuses the boot, and the message names it. A missing or empty `issuer` or `audience` refuses the boot, naming the key.
- **The algorithm is pinned.** A JWS service accepts `headerAlgorithm` (`HS256` by default) only, and a JWKS issuer accepts its `algorithm` only. A token signed `HS512` with the same secret is refused. `verify.algorithms` widens the pin by an explicit choice.
- **A JWKS verifier requires `verify.algorithms`.** It cannot know what the issuer signs with, so a verifier without `verify.algorithms` does not boot.
- **One home for the two values.** `issuer` and `audience` moved out of `verify`, and the `sign` option is gone. A configuration that still passes them is refused at boot with a message that points to `claims`. The other `verify` options (`subject`, `clockTolerance`, `maxTokenAge`, `typ`, `requiredClaims`) stay.
- **Per-token claims.** `generate({ claims })` still sets a per-token `audience`, `issuer`, `subject` or `jwtId`, and wins over the configured ones. The payload never does.
- **Service assertions are unchanged.** They already stamp their `name` as `iss` and demand it as `aud`.

## Who is affected

- **Every application that configures `JWT_OPTIONS`.** Add `claims`, and for a JWKS verifier `verify.algorithms`. The application does not boot without them.
- **Tokens issued before the upgrade.** They carry no `iss` and no `aud`, so they are refused: users sign in again. There is no switch to accept them.
- **A fleet.** Give every verifier the `issuer` and `audience` its issuer stamps. A token minted for another service by another `audience` is refused by design.
- **Supabase or another provider.** Use the values its tokens carry: Supabase Auth writes `https://<project>.supabase.co/auth/v1` and `authenticated`.

## Breaking changes

> [!WARNING]
> An application whose JWT options have no `claims` does not boot, and every token issued before the upgrade is refused.

**Before:**

```typescript
// JWS
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: process.env.APP_ENV_JWT_SECRET!,
    getTokenExpiresFn: () => 86400,
    sign: { issuer: 'my-api', audience: 'my-api' }, // optional
    verify: { issuer: 'my-api', audience: 'my-api' }, // optional
  },
});

// JWKS verifier
options: { mode: JWKSModes.VERIFIER, jwksUrl: 'https://auth.example.com/certs' }
```

**After:**

```typescript
// JWS
this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: {
    jwtSecret: process.env.APP_ENV_JWT_SECRET!,
    getTokenExpiresFn: () => 86400,
    claims: { issuer: 'my-api', audience: 'my-api' }, // required
  },
});

// JWKS issuer
options: { mode: JWKSModes.ISSUER, /* algorithm, keys, kid, getTokenExpiresFn */ claims: { issuer: 'https://auth.example.com', audience: 'my-api' } }

// JWKS verifier: the issuer and audience the issuer stamps, and the algorithm it signs with
options: {
  mode: JWKSModes.VERIFIER,
  jwksUrl: 'https://auth.example.com/certs',
  claims: { issuer: 'https://auth.example.com', audience: 'my-api' },
  verify: { algorithms: ['ES256'] },
}
```

**Upgrade steps:**

1. Choose an `issuer` and an `audience` per service. The issuer name is what identifies who signed; the audience is who the token is for.
2. Replace `sign: { issuer, audience }` and `verify: { issuer, audience }` with `claims`, and add `verify.algorithms` to each JWKS verifier.
3. Deploy. Users with an older token sign in again.

## Details

| File | Package |
|------|---------|
| `src/base/auth/authenticate/common/types/jwt.ts` | kernel |
| `src/components/auth/authenticate/component.ts` | core |
| `src/components/auth/authenticate/services/bearer/abstract.service.ts` | core |
| `src/components/auth/authenticate/services/bearer/jws.service.ts` | core |
| `src/components/auth/authenticate/services/bearer/jwks/issuer.service.ts` | core |
| `src/components/auth/authenticate/services/bearer/jwks/verifier.service.ts` | core |
