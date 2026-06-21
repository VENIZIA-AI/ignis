---
title: Current User Information Endpoint
description: Auth controller adds GET /me and a withUserInformation flag on /who-am-i, backed by the optional IAuthService.getUserInformation
---

# Changelog - 2026-06-18

## Current User Information Endpoint

The generated authentication controller now exposes the optional `IAuthService.getUserInformation` method through two routes: a dedicated `GET /me` endpoint and an opt-in `?withUserInformation=true` flag on the existing `GET /who-am-i` route. Previously `getUserInformation` was declared on the interface but never wired to any route.

## Overview

- **New route**: `GET /me`, registered by `defineAuthController`, returns the result of `IAuthService.getUserInformation`
- **Updated route**: `GET /who-am-i` accepts a `withUserInformation` query flag - when truthy, it attaches a `userInformation` field to the JWT payload response
- **JWT-protected**: both require a currently valid access token (`Authentication.STRATEGY_JWT`)
- **Optional service hook**: `IAuthService.getUserInformation?(context, opts)` - returns `501 Not Implemented` if the service does not implement it
- **Customizable response schema**: via `payload.getUserInformation.response.schema`
- **OpenAPI**: the `who-am-i` response schema is extended with an optional `userInformation` field so Swagger documents the merged shape

## New Features

### `GET /me`

**File:** `packages/core/src/components/auth/authenticate/controllers/factory.ts`

**Problem:** `IAuthService.getUserInformation` was an optional contract method with no route wiring - services could implement it, but the framework never invoked it.

**Solution:** `defineAuthController` registers a JWT-authenticated route that delegates to the service. It mirrors the `refreshToken` not-implemented guard.

```typescript
this.defineRoute({
  configs: {
    description: 'Get current user information',
    path: '/me',
    method: HTTP.Methods.GET,
    responses: jsonResponse({
      schema: payload?.getUserInformation?.response?.schema ?? AnyObjectSchema,
      description: 'Success Response',
    }),
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  },
  handler: async context => {
    if (!this.service.getUserInformation) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        message: 'Method not implemented',
      });
    }
    const rs = await this.service.getUserInformation(context, {});
    return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
  },
});
```

### `GET /who-am-i?withUserInformation=true`

The `who-am-i` route gains an optional query flag. It accepts `true`, `false`, `1`, or `0` and coerces to a boolean. When truthy, the handler calls `getUserInformation` and merges the result into the principal as `userInformation`:

```typescript
const { withUserInformation = false } = context.req.valid('query');
const currentUser = context.get(Authentication.CURRENT_USER);
let rs = currentUser;

if (withUserInformation) {
  if (!this.service.getUserInformation) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
      message: 'Method not implemented',
    });
  }
  const userInformation = await this.service.getUserInformation(context, {});
  rs = Object.assign({}, currentUser, { userInformation });
}

return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
```

The `200` response schema is extended so the optional field is OpenAPI-documented:

```typescript
schema: JWTTokenPayloadSchema.extend({
  userInformation: (payload?.getUserInformation?.response?.schema ?? AnyObjectSchema)
    .optional()
    .openapi({ description: 'Attached when withUserInformation is truthy' }),
}),
```

### `IAuthService.getUserInformation`

**File:** `packages/core/src/components/auth/authenticate/common/types.ts`

The method already existed on the interface; the `payload` option now carries a matching config so the response schema is customizable, consistent with the other routes:

```typescript
defineAuthController({
  // ...
  payload: {
    getUserInformation: { response: { schema: GetUserInformationResponseSchema } },
  },
});
```

Implement it to return whatever profile shape your application needs:

```typescript
class MyAuthService implements IAuthService {
  async getUserInformation(context, _opts) {
    const current = context.get(Authentication.CURRENT_USER);
    return this.userRepository.findById({ id: current.userId });
  }
}
```

**Benefits:**
- A first-class profile endpoint without writing a custom controller
- Two access shapes from one service method: standalone (`/me`) or merged into the principal (`/who-am-i`)
- Opt-in: services that don't implement `getUserInformation` cleanly return `501`
- Response shape is customizable and OpenAPI-documented

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authenticate/controllers/factory.ts` | Added `GET /me`; added `withUserInformation` query flag to `/who-am-i`; extended `who-am-i` response schema with optional `userInformation` |
| `src/components/auth/authenticate/common/types.ts` | Added optional `getUserInformation` payload config to `TDefineAuthControllerOpts` |

## No Breaking Changes

The new route, query flag, and payload config are additive. Existing auth services compile unchanged; both `/me` and `who-am-i?withUserInformation=true` return `501 Not Implemented` until `getUserInformation` is implemented. The default `who-am-i` response (without the flag) is unchanged.
