---
title: Refresh Access Token Endpoint
description: Auth controller factory adds a JWT-protected POST /token/refresh route backed by an optional IAuthService.refreshToken
---

# Changelog - 2026-05-05

## Refresh Access Token Endpoint

The generated authentication controller now exposes a `POST /token/refresh` route that re-issues an access token for an already-authenticated caller. It is backed by an optional `refreshToken` method on `IAuthService`.

## Overview

- **New route**: `POST /token/refresh`, registered by `defineAuthController`
- **JWT-protected**: requires a currently valid access token (`Authentication.STRATEGY_JWT`)
- **Optional service hook**: `IAuthService.refreshToken?(context)` — returns `501 Not Implemented` if the service does not implement it
- **Customizable response schema**: via `payload.refreshToken.response.schema`
- **Consistency cleanup**: auth routes now use `HTTP.Methods.*` constants and carry OpenAPI `description`s

## New Features

### `POST /token/refresh`

**File:** `packages/core/src/components/auth/authenticate/controllers/factory.ts`

**Problem:** There was no first-class way to renew an access token. Clients had to re-run the full sign-in flow when a token neared expiry.

**Solution:** `defineAuthController` registers a JWT-authenticated refresh route that delegates to the auth service. Because the route requires a valid JWT, it re-issues a token for the current principal — there is no separate long-lived refresh token.

```typescript
this.defineRoute({
  configs: {
    description: 'Refresh access token',
    path: '/token/refresh',
    method: HTTP.Methods.POST,
    responses: jsonResponse({
      schema: payload?.refreshToken?.response?.schema ?? AnyObjectSchema,
      description: 'Success Response',
    }),
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  },
  handler: async context => {
    if (!this.service.refreshToken) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        message: 'Method not implemented',
      });
    }
    const rs = await this.service.refreshToken(context);
    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  },
});
```

### `IAuthService.refreshToken`

**File:** `packages/core/src/components/auth/authenticate/common/types.ts`

The auth service interface gains an optional method and a matching response-type generic (`RTRS`):

```typescript
export interface IAuthService<
  /* ...existing generics... */
  RTRS = AnyObject,
> {
  signIn(context, opts): Promise<SIRS>;
  signUp(context, opts): Promise<SURS>;
  changePassword(context, opts): Promise<CPRS>;
  getUserInformation?(context, opts): Promise<UIRS>;
  refreshToken?(context: TContext<E>): Promise<RTRS>;
}
```

Implement it to issue a new token from the current request context:

```typescript
class MyAuthService implements IAuthService {
  async refreshToken(context) {
    const current = context.get(Authentication.CURRENT_USER);
    const token = await this.jwtTokenService.generate({ payload: { userId: current.userId } });
    return { token };
  }
}
```

And optionally type the response in the controller definition:

```typescript
defineAuthController({
  // ...
  payload: {
    refreshToken: { response: { schema: RefreshTokenResponseSchema } },
  },
});
```

> [!NOTE]
> Because the endpoint authenticates with the standard JWT strategy, the caller must present a still-valid access token. If you need rotation or revocation of long-lived refresh tokens, implement that policy inside your `refreshToken` service method.

**Benefits:**
- Token renewal without a full re-authentication
- Opt-in: services that don't implement `refreshToken` cleanly return `501`
- Response shape is customizable and OpenAPI-documented

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authenticate/controllers/factory.ts` | Added `POST /token/refresh`; switched routes to `HTTP.Methods.*`; added route descriptions |
| `src/components/auth/authenticate/common/types.ts` | `refreshToken?` on `IAuthService` (+ `RTRS` generic); optional `refreshToken` payload config |

## No Breaking Changes

The route and service method are additive. Existing auth services compile unchanged; the refresh route returns `501 Not Implemented` until `refreshToken` is implemented.
