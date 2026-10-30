---
title: Refresh Access Token Endpoint
description: The generated auth controller now has a JWT-protected POST /token/refresh route backed by an optional IAuthService.refreshToken.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-05

## Refresh Access Token Endpoint

**In one line.** Clients can renew an access token without signing in again.

## What changed

- **New route.** `defineAuthController` registers `POST /token/refresh`. It requires a currently valid access token (`Authentication.STRATEGY_JWT`).
- **Optional service method.** Implement `IAuthService.refreshToken?(context)` to issue the new token. Without it the route returns `501 Not Implemented`.
- **Custom response schema.** Set it with `payload.refreshToken.response.schema`.
- **Auth routes.** They now use `HTTP.Methods.*` constants and carry OpenAPI descriptions.

```typescript
class MyAuthService implements IAuthService {
  async refreshToken(context) {
    const current = context.get(Authentication.CURRENT_USER);
    const token = await this.jwtTokenService.generate({ payload: { userId: current.userId } });
    return { token };
  }
}

defineAuthController({
  // ...
  payload: {
    refreshToken: { response: { schema: RefreshTokenResponseSchema } },
  },
});
```

`IAuthService` gains a matching response-type generic, `RTRS`.

## Who is affected

- **Existing auth services.** No action needed. They compile unchanged and the route returns `501` until you implement `refreshToken`.
- **Teams wanting long-lived refresh tokens.** There is no separate refresh token: the caller must present a still-valid access token. Implement rotation or revocation inside your `refreshToken` method.
