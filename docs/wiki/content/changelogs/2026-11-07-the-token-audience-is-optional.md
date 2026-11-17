---
title: The token audience is optional
description: "claims.audience is optional. Without it no aud is stamped and none is checked; claims.issuer stays required. Set, the audience works as before."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-07

## The token audience is optional

<Badge type="warning" text="Behavior Change" />

**In one line.** `claims.issuer` stays required, and `claims.audience` is optional now. A token service without an audience stamps no `aud` and checks none, as before the claims option; with one, it works as it did.

## What changed

- **`claims.issuer` is required.** It is stamped as `iss` on every token IGNIS signs and required on every token it verifies, so a token signed with the same key for another purpose is still refused.
- **`claims.audience` is optional.** Absent, nothing is stamped and `aud` is not checked: a token with or without one verifies.
- **A present audience is checked at boot.** It must be a non-empty string or a non-empty list of non-empty strings. `null`, an empty or blank string, an empty list and a list with a non-string refuse the boot, naming `claims.audience`. `audience: undefined` counts as absent.
- **Where.** The JWS token service, the JWKS issuer and the JWKS verifier.
- **Per-token audience.** `generate({ claims: { audience } })` still stamps one token with its own audience, with or without a configured one.
- **Unchanged.** `claims` accepts `issuer` and `audience` only, the algorithm pin and `verify.algorithms` for a JWKS verifier stay, and a service assertion keeps its own `iss` and `aud`.

## Who is affected

- **Applications that set both `issuer` and `audience`.** No action needed.
- **Applications that wanted to keep tokens without an `aud` working.** Leave `audience` out. Tokens from before the claims option have no `iss` either, so they still need the issuer to match.
- **Everyone else.** No action needed.

## Configuration

**Without an audience:**

```typescript
claims: { issuer: 'my-api' }
// signs { iss: 'my-api' }; verifies iss === 'my-api'; aud is neither stamped nor checked
```

**With an audience:**

```typescript
claims: { issuer: 'my-api', audience: 'inventory' }
// signs { iss: 'my-api', aud: 'inventory' }; verifies both, and refuses a token with another or no aud
```

## Details

| File | Package |
|------|---------|
| `src/base/auth/authenticate/common/types/jwt.ts` | kernel |
| `src/components/auth/authenticate/services/bearer/abstract.service.ts` | core |
