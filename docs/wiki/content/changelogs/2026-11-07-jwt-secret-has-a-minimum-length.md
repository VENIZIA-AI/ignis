---
title: The JWT secret has a minimum length
description: "An application whose jwtSecret is shorter than 32 bytes refuses to boot, and the message says how to generate one."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-07

## The JWT secret has a minimum length

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `jwtSecret`, the key that signs and verifies HS256 tokens, must be at least 32 bytes. A shorter one refuses the boot.

## What changed

- **Minimum of 32 bytes.** The authentication component checks `jwtSecret` at boot, and `JWSTokenService` checks it when it is built. The length is counted in UTF-8 bytes, not characters.
- **A message that helps.** `jwtSecret is too short: 20 bytes, at least 32 are required | Generate one with: openssl rand -base64 48`. The message never shows the secret.
- **Only `jwtSecret`.** `applicationSecret` is an AES passphrase for payload fields, not an HMAC key, and has no minimum. The missing and placeholder (`unknown_secret`) checks are unchanged.

## Who is affected

- **Applications with a short `jwtSecret`.** They stop booting until the secret is longer. Changing the secret signs every user out: tokens signed with the old one stop verifying.
- **Everyone else.** No action needed. `openssl rand -base64 32` already gives 44 characters.

## Breaking changes

> [!WARNING]
> An application whose `jwtSecret` is shorter than 32 bytes does not boot.

**Before:**

```bash
APP_ENV_JWT_SECRET=change-me
```

**After:**

```bash
APP_ENV_JWT_SECRET=$(openssl rand -base64 48)
```

## Details

| File | Package |
|------|---------|
| `src/components/auth/authenticate/component.ts` | core |
| `src/components/auth/authenticate/services/bearer/jws.service.ts` | core |
