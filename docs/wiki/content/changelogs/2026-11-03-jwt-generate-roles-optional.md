---
title: A token can be generated without roles
description: "generate takes IJWTGeneratePayload, where roles is optional; verify still returns IJWTTokenPayload."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-03

## A token can be generated without roles

<Badge type="tip" text="Enhancement" />

**In one line.** Leave `roles` out of `generate({ payload })` when your app gets roles elsewhere. You no longer cast.

## What changed

- **New type: `IJWTGeneratePayload`.** It is `IJWTTokenPayload` with `roles` optional. The role shape gets its own name, `TJWTTokenRole`.
- **These now take `IJWTGeneratePayload`:** `generate`, `getSigner` and `encryptPayload` on the JWS and JWKS token services.
- **`verify` still returns `IJWTTokenPayload`, with `roles` typed as present.**
- **Nothing changes at run time.** A token without `roles` was already signed and verified as is. Encryption skips the missing field, and authorization reads the roles as none.

## Who is affected

- **Apps that sign tokens without roles and cast to `IJWTTokenPayload`.** Drop the cast.
- **Apps that sign some tokens without roles.** `verify` types `roles` as present, but such a token has none. Check `roles` before you read it.
- **A subclass that overrides `getSigner` or `encryptPayload`.** It keeps compiling. Switch the parameter to `IJWTGeneratePayload` to accept the wider input.
- **Everyone else.** No action needed.
