---
title: Basic Authentication Strategy
description: IGNIS can now authenticate API requests with HTTP Basic authentication.
packages: ['@venizia/ignis']
---

# Changelog - 2026-01-06

## Basic Authentication Strategy

**In one line.** Protect routes with HTTP Basic authentication using `Authentication.STRATEGY_BASIC`.

## What changed

- **`BasicAuthenticationStrategy`.** Reads `Authorization: Basic <base64>`, decodes `username:password`, verifies it with your own `verifyCredentials` function and returns the user profile.
- **`BasicTokenService`.** Extracts and verifies the credentials; supports custom verification logic.
- **Registry.** Works with the existing `AuthenticationStrategyRegistry`.

```typescript
import { Authentication, ControllerFactory } from '@venizia/ignis';

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: UserRepository.name },
  controller: { name: 'UserController', basePath: '/users' },

  // Enable basic auth for all routes
  authStrategies: [Authentication.STRATEGY_BASIC],

  // Or per-route configuration
  routes: {
    create: {
      authStrategies: [Authentication.STRATEGY_BASIC],
    },
  },
});
```

```typescript
const verifyCredentials = async (username: string, password: string) => {
  const user = await userRepository.findOne({ where: { username } });

  if (!user || !await comparePassword(password, user.passwordHash)) {
    throw new HttpErrors.Unauthorized('Invalid credentials');
  }

  return { id: user.id, username: user.username };
};
```

```bash
curl -X GET http://api.example.com/users \
  -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ="
```

## Who is affected

- **Everyone.** No action needed. The strategy is opt-in.

## Details

- Basic Auth sends credentials as base64, which is NOT encrypted. Always use HTTPS in production.
- Consider rate limiting to prevent brute force attacks.
- For sensitive APIs, prefer JWT or OAuth2 strategies.
