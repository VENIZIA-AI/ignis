---
title: Current User Information Endpoint
description: Auth controller adds GET /me and a withUserInformation flag on /who-am-i, backed by the optional IAuthService.getUserInformation
---

# Changelog - 2026-06-18

## Current User Information Endpoint

<Badge type="tip" text="New Feature" />

**In one line.** The generated auth controller now wires up a `GET /me` profile endpoint and an opt-in `?withUserInformation=true` flag on `GET /who-am-i`, both backed by the optional `IAuthService.getUserInformation` method that previously had no route.

## What changed

- **New route: `GET /me`** - registered by `defineAuthController`, returns the result of `IAuthService.getUserInformation`.
- **Updated route: `GET /who-am-i?withUserInformation=true`** - when the flag is truthy, the response gains a `userInformation` field alongside the existing JWT payload.
- **JWT-protected** - both routes require a valid access token (`Authentication.STRATEGY_JWT`), same as the rest of the auth controller.
- **Optional service hook** - `IAuthService.getUserInformation?(context, opts)` returns `501 Not Implemented` if the application's auth service does not implement it.
- **Customizable response schema** - via `payload.getUserInformation.response.schema` on `defineAuthController`.
- **OpenAPI updated** - the `who-am-i` response schema documents the optional `userInformation` field.

## Who is affected

- **Applications that don't implement `getUserInformation` on their auth service** - no action needed. Both `/me` and `/who-am-i?withUserInformation=true` cleanly return `501 Not Implemented`; the default `/who-am-i` response is unchanged.
- **Applications that already implement `getUserInformation`** - no action needed to keep current behavior, but you now get a working `/me` endpoint and the `/who-am-i` merge flag for free. Optionally set `payload.getUserInformation.response.schema` for OpenAPI documentation.
- **Frontend clients** - can fetch a standalone profile via `GET /me`, or merge it into the existing `/who-am-i` principal by adding `?withUserInformation=true`.

## Details

Implement the hook to return whatever profile shape the application needs:

```typescript
class MyAuthService implements IAuthService {
  async getUserInformation(context, _opts) {
    const current = context.get(Authentication.CURRENT_USER);
    return this.userRepository.findById({ id: current.userId });
  }
}
```

Optionally document the response shape:

```typescript
defineAuthController({
  // ...
  payload: {
    getUserInformation: { response: { schema: GetUserInformationResponseSchema } },
  },
});
```

`GET /who-am-i?withUserInformation=true` accepts `true`, `false`, `1`, or `0` for the flag, coerced to a boolean, and merges the result under a `userInformation` key on top of the existing principal.
