---
title: Basic Authentication Strategy
description: Added HTTP Basic Authentication strategy for API authentication
---

# Changelog - 2026-01-06

## Basic Authentication Strategy

This release adds HTTP Basic Authentication support to the Ignis authentication system.

## Overview

- **BasicAuthenticationStrategy**: New strategy implementing HTTP Basic auth
- **BasicTokenService**: Service for extracting and verifying credentials from `Authorization: Basic <base64>` header
- **Integration**: Works with existing AuthenticationStrategyRegistry

## New Features

### BasicAuthenticationStrategy

**File:** `packages/core/src/components/auth/authenticate/strategies/basic.strategy.ts`

New authentication strategy that:
- Extracts credentials from `Authorization: Basic <base64>` header
- Decodes base64-encoded `username:password` format
- Verifies credentials using custom `verifyCredentials` function
- Returns user profile on successful authentication

### BasicTokenService

**File:** `packages/core/src/components/auth/authenticate/services/basic-token.service.ts`

Service handling credential extraction and verification:
- Parses `Authorization` header with `Basic` scheme
- Decodes base64 credentials to `username:password`
- Supports custom credential verification logic

## Usage

### Step 1: Configure Basic Auth in Controller

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

### Step 2: Implement Credential Verification

```typescript
import { BasicTokenService } from '@venizia/ignis';

// Custom credential verification
const verifyCredentials = async (username: string, password: string) => {
  const user = await userRepository.findOne({ where: { username } });

  if (!user || !await comparePassword(password, user.passwordHash)) {
    throw new HttpErrors.Unauthorized('Invalid credentials');
  }

  return { id: user.id, username: user.username };
};
```

### Step 3: Client Usage

```bash
# Base64 encode credentials: username:password
curl -X GET http://api.example.com/users \
  -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ="
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authenticate/strategies/basic.strategy.ts` | New BasicAuthenticationStrategy |
| `src/components/auth/authenticate/services/basic-token.service.ts` | New BasicTokenService |
| `src/components/auth/authenticate/common/keys.ts` | Added STRATEGY_BASIC constant |
| `src/components/auth/index.ts` | Export basic auth components |

## Security Considerations

- Basic Auth transmits credentials in base64 (NOT encrypted)
- Always use HTTPS in production
- Consider rate limiting to prevent brute force attacks
- For sensitive APIs, prefer JWT or OAuth2 strategies
