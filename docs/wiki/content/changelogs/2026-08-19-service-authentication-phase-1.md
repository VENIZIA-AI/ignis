---
title: Your Own Authentication Strategies, and Tokens That Say Who They Are For
description: Register a strategy beyond jwt and basic, check aud and iss when verifying, and stamp them when issuing.
---

# Changelog - 2026-08-19

## Service-to-service authentication, phase 1

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A route can name any authentication strategy you register, and a JWT can now say who issued it and who it is for.

```ts
// The strategy name is yours. No cast.
@get({ path: '/orders', authenticate: { strategies: ['service'] } })

// The issuer stamps who it is, and who the token is for.
jwtOptions: {
  standard: 'JWKS',
  options: { mode: 'issuer', sign: { issuer: 'identity', audience: 'inventory' }, /* ... */ },
}

// The verifier refuses anything not addressed to it.
jwtOptions: {
  standard: 'JWKS',
  options: { mode: 'verifier', verify: { audience: 'inventory', maxTokenAge: '60 seconds' }, /* ... */ },
}
```

## What changed

- **`TAuthStrategy` accepts any registered name.** `'jwt'` and `'basic'` still autocomplete; anything you register with `AuthenticationStrategyRegistry` now typechecks without a cast.
- **A misspelled strategy is reported at boot**, at error level, naming both the typo and what was registered. Previously it compiled only for the two built-ins and, once the type opened, would have 401'd every request with nothing above debug level to explain it.
- **`verify` checks claims.** `audience`, `issuer`, `subject`, `algorithms`, `clockTolerance`, `maxTokenAge`, `typ` and `requiredClaims`, passed straight to jose.
- **`sign` stamps claims**, and `generate({ payload, claims })` sets per-token `aud` / `sub` / `jti`.
- **`securitySchemes` on the API reference**, so a route naming your strategy publishes a valid OpenAPI document.
- **`AuthenticationStrategyRegistry.has()` / `.getNames()` / `.findUnregistered()` / `.assertRegistered()`** for building your own startup checks.

## Who is affected

- **Anyone registering a custom strategy.** The cast at every route goes away. Declare a `securitySchemes` entry for your strategy name, or your generated OpenAPI document names a scheme it never declares.
- **Anyone running more than one service off one issuer.** Set `verify.audience`. Without it, a token minted for one service is accepted verbatim by every other - there is no cryptographic notion of "this token was meant for me".
- **Anyone importing any `Swagger*` symbol.** `SwaggerComponent`, `ISwaggerOptions` and `SwaggerBindingKeys` are all removed in this release. It is a rename - see Breaking changes.
- **Everyone else.** No action needed. Every new option is optional and unset means today's behaviour, byte for byte.

## Breaking changes

### The deprecated `Swagger*` aliases are removed

All three go together, so nothing is left half-renamed:

| Removed | Use instead |
|---|---|
| `SwaggerComponent` | `ApiReferenceComponent` |
| `ISwaggerOptions` | `IApiReferenceOptions` |
| `SwaggerBindingKeys.SWAGGER_OPTIONS` | `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` |

```ts
// Before
import { ISwaggerOptions, SwaggerBindingKeys, SwaggerComponent } from '@venizia/ignis';

this.bind<ISwaggerOptions>({ key: SwaggerBindingKeys.SWAGGER_OPTIONS }).toValue({ /* ... */ });
this.component(SwaggerComponent);

// After
import { ApiReferenceBindingKeys, ApiReferenceComponent, IApiReferenceOptions } from '@venizia/ignis';

this.bind<IApiReferenceOptions>({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS }).toValue({ /* ... */ });
this.component(ApiReferenceComponent);
```

It is a rename only. `SwaggerBindingKeys.SWAGGER_OPTIONS` always held the same
`'@app/api-reference/options'` string, so no binding moves and no runtime behaviour changes.

### A configured `iss` / `aud` now wins over the payload

> [!WARNING]
> Only for applications that already smuggle `iss` or `aud` through the token payload.

A configured `sign.issuer` / `sign.audience` is **authoritative**. It overrides a claim of the same name on the payload, and logs a warning when it does.

**Before** - the payload was the only way to set these, and it won:

```ts
await tokenService.generate({ payload: { userId, aud: 'inventory' } });
```

**After** - configure the default, and pass per-token claims explicitly:

```ts
// once, in the issuer options
sign: { issuer: 'identity', audience: 'inventory' }

// per token, when it genuinely varies
await tokenService.generate({ payload: { userId }, claims: { audience: 'inventory' } });
```

The reason is not tidiness. `iss` and `aud` are standard JWT fields, so they pass through the AES payload envelope in the clear - an issuer identity that any payload could overwrite is not an identity. With `sign` unset, nothing fires and tokens are unchanged.

## Details

### The registry is the source of truth for a strategy name

`AuthenticateStrategy.isValid` knows the two built-ins only, and returns `false` for a strategy you registered. It stays as a public export, but never build a check on it - ask the registry:

```ts
AuthenticationStrategyRegistry.getInstance().has({ name: 'service' });
AuthenticationStrategyRegistry.getInstance().getNames();
```

The framework reports unregistered names while building route configs, which happens after registration. It **reports** rather than throws, deliberately:

- `defineAuthController` hard-codes `'jwt'` on four of its routes. An application that registers its JWT strategy under a custom name - the configuration this release adds support for - would stop booting.
- A route listing several strategies in `mode: 'any'` tolerates one that does not resolve. That is a working setup today.

An empty `strategies` array is never reported: that is how `authenticate: { skip: true }` is encoded.

If you want the hard failure, ask for it in your own startup:

```ts
AuthenticationStrategyRegistry.getInstance().assertRegistered({ names: ['service', 'jwt'] });
```

### Audience matching is overlap, not equality

jose accepts a token whose `aud` **contains** the configured value. A token carrying `['commerce','inventory']` satisfies `verify.audience: 'inventory'`. If you want strict single-audience tokens, enforce that when you issue them.

### `maxTokenAge` is the replay window

`exp` is chosen by whoever minted the token. `maxTokenAge` caps elapsed time since `iat` regardless, which is what a short-lived per-request assertion actually needs.

### Diagnosing a rejection

Every verification failure still surfaces as one `TOKEN_INVALID`, but the jose error survives on `cause` - `JWTClaimValidationFailed: unexpected "aud" claim value` rather than a generic "invalid or expired token". That distinction is the difference between an afternoon and a week during a fleet-wide rollout.

| File | Package |
|------|---------|
| `src/base/auth/authenticate/common/constants.ts` | kernel |
| `src/base/auth/authenticate/common/types.ts` | kernel |
| `src/base/auth/authenticate/strategies/strategy-registry.ts` | kernel |
| `src/base/auth/base/abstract-auth-registry.ts` | kernel |
| `src/components/auth/authenticate/services/bearer/` | core |
| `src/components/api-reference/` | core |
