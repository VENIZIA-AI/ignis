---
title: Current User Information Endpoint
description: The auth controller adds GET /me and a withUserInformation flag on /who-am-i, backed by the optional IAuthService.getUserInformation.
packages: ['@venizia/ignis']
---

# Changelog - 2026-06-18

## Current User Information Endpoint

<Badge type="tip" text="New Feature" />

**In one line.** If your auth service implements `getUserInformation`, the generated auth controller now serves it at `GET /me`, with no custom controller needed.

## What changed

- **New route `GET /me`.** Registered by `defineAuthController`. It returns the result of `IAuthService.getUserInformation`.
- **`GET /who-am-i?withUserInformation=true`.** The response gains a `userInformation` field next to the JWT payload. The flag accepts `true`, `false`, `1` or `0`.
- **JWT-protected.** Both need a valid access token (`Authentication.STRATEGY_JWT`).
- **`501 Not Implemented`.** Returned when the auth service does not implement `getUserInformation?(context, opts)`. The default `/who-am-i` response is unchanged.
- **Response schema.** Set it with `payload.getUserInformation.response.schema`. The `who-am-i` OpenAPI schema documents the optional `userInformation` field.

```typescript
class MyAuthService implements IAuthService {
  async getUserInformation(context, _opts) {
    const current = context.get(Authentication.CURRENT_USER);
    return this.userRepository.findById({ id: current.userId });
  }
}

defineAuthController({
  // ...
  payload: {
    getUserInformation: { response: { schema: GetUserInformationResponseSchema } },
  },
});
```

## Who is affected

- **Apps without `getUserInformation`.** No action needed. `/me` and `/who-am-i?withUserInformation=true` return `501`.
- **Apps that already implement it.** No action needed. You now get `/me` and the merge flag.

## See also

- [Authentication](/extensions/components/authentication/)
- [Authentication API](/extensions/components/authentication/api)
