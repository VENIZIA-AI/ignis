---
title: roles is optional on the JWT payload
description: "IJWTTokenPayload.roles is optional: a token may be generated without it, and code that reads it must check it first."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-03

## roles is optional on the JWT payload

<Badge type="danger" text="Breaking" />

**In one line.** A token may carry no `roles`. `bun check` now flags every read of `roles` that does not check for it first.

## What changed

- **`IJWTTokenPayload.roles` is optional (`roles?: TJWTTokenRole[]`).** This one type covers both `generate` (what you sign) and `verify` (what you read back).
- **The role shape has a name: `TJWTTokenRole`** (`{ id, identifier, priority }`). `AuthenticationFieldCodecs.ROLES_CODEC` is typed with it.
- **Nothing changes at run time.** A token without `roles` was already signed and verified as is. Encryption skips the missing field, and authorization reads the roles as none.

## To upgrade

1. Run `bun check`.
2. At each place that reads `roles` from a payload, handle the missing case, for example `payload.roles ?? []`.
3. If you signed tokens without roles behind a cast to `IJWTTokenPayload`, delete the cast.

## Who is affected

- **Code that reads `roles` from a verified token or from `Authentication.CURRENT_USER` typed as `IJWTTokenPayload`.** This is a type-only break, and `bun check` lists each place.
- **Code that typed a codec as `IPayloadFieldCodec<IJWTTokenPayload['roles']>`.** Use `IPayloadFieldCodec<TJWTTokenRole[]>`.
- **Everyone else.** No action needed.
