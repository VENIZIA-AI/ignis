---
title: Your Own Authentication Strategies, and Tokens That Say Who They Are For
description: A route can name any authentication strategy you register, and a JWT can now be issued and verified with issuer and audience claims.
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-kernel']
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

- **`TAuthStrategy` accepts any registered name.** `'jwt'` and `'basic'` still autocomplete; anything you register with `AuthenticationStrategyRegistry` typechecks without a cast.
- **A misspelled strategy is reported at boot,** at error level, naming both the typo and what was registered.
- **`verify` checks claims:** `audience`, `issuer`, `subject`, `algorithms`, `clockTolerance`, `maxTokenAge`, `typ` and `requiredClaims`, passed straight to jose.
- **`sign` stamps claims,** and `generate({ payload, claims })` sets per-token `aud`, `sub` and `jti`.
- **`securitySchemes` on the API reference,** so a route naming your strategy publishes a valid OpenAPI document.
- **`AuthenticationStrategyRegistry.has()`, `.getNames()`, `.findUnregistered()` and `.assertRegistered()`** for your own startup checks.

## Who is affected

- **Anyone registering a custom strategy.** The cast at every route goes away. Declare a `securitySchemes` entry for your strategy name, or your OpenAPI document names a scheme it never declares.
- **Anyone running more than one service off one issuer.** Set `verify.audience`. Without it, a token minted for one service is accepted by every other.
- **Anyone importing a deprecated alias or any `Swagger*` symbol.** They are removed. See Breaking changes.
- **Everyone else.** No action needed. Every new option is optional, and unset means today's behaviour.

## Breaking changes

### The deprecated `Swagger*` aliases are removed

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

It is a rename only. `SwaggerBindingKeys.SWAGGER_OPTIONS` always held the same `'@app/api-reference/options'` string, so no binding moves.

### Every deprecated alias is removed

| Removed | Use instead | Package |
|---|---|---|
| `QueueHelper` | `SequentialQueueHelper` | helpers |
| `TNodePostgresConnector` | `TRelationalConnector` | connectors |
| `TNodePostgresTransactionConnector` | `TRelationalConnector` | connectors |

### A configured `iss` / `aud` now wins over the payload

> [!WARNING]
> Only for applications that already smuggle `iss` or `aud` through the token payload.

A configured `sign.issuer` or `sign.audience` overrides a claim of the same name on the payload, and logs a warning when it does. With `sign` unset, tokens are unchanged.

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

## Details

- `AuthenticateStrategy.isValid` knows only the two built-ins and returns `false` for a strategy you registered. Ask the registry instead:

```ts
AuthenticationStrategyRegistry.getInstance().has({ name: 'service' });
AuthenticationStrategyRegistry.getInstance().getNames();
```

- Unregistered names are reported, not thrown, while building route configs. An empty `strategies` array is never reported, since that is how `authenticate: { skip: true }` is encoded. For a hard failure, call it in your own startup:

```ts
AuthenticationStrategyRegistry.getInstance().assertRegistered({ names: ['service', 'jwt'] });
```

- **Audience matching is overlap, not equality.** A token with `aud` `['commerce','inventory']` satisfies `verify.audience: 'inventory'`. To require single-audience tokens, enforce it when you issue them.
- **`maxTokenAge` is the replay window.** It caps elapsed time since `iat` regardless of `exp`, which the minting side chooses.
- **Diagnosing a rejection.** Every verification failure surfaces as one `TOKEN_INVALID`, and the jose error survives on `cause`, for example `JWTClaimValidationFailed: unexpected "aud" claim value`.
