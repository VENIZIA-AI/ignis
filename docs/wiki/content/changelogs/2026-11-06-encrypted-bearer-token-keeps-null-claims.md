---
title: An encrypted bearer token keeps null claims
description: "With applicationSecret set, a null claim is now encrypted and decodes as null, as it does without encryption, so an encrypted token decodes to the same payload as a plain one."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-06

## An encrypted bearer token keeps null claims

<Badge type="info" text="Bug Fix" />

**In one line.** With `applicationSecret` set, a claim whose value is `null` used to be dropped from the token, so `someId: null` arrived as no `someId` at all. It is now kept and decodes as `null`, the same as without encryption.

## What changed

- **`null` is a value.** `AbstractBearerTokenService.encryptPayload` encrypts a `null` claim like any other, and it decodes as `null`. An app can tell "null on purpose" from "claim absent", for example an older token.
- **`undefined` is still skipped.** JSON drops it, so the claim is absent with encryption on or off.
- **Same payload either way.** The encrypted and the plain mode decode the same payload to the same object.
- **A `null` never reaches a field codec.** It is written and read as the text `null` before the codec for its key is consulted, so a codec that expects a value, such as a date codec, is not called with `null`. The one cost: a codec whose real output for a non-null value is exactly the text `null` would read back as `null`; none of the built-in codecs does that.

## Who is affected

- **Apps with `applicationSecret` that mint tokens with `null` claims.** Those claims now arrive as `null` instead of missing. Code that read a missing claim as `undefined` and now meets `null` should check for both. The framework reads a `null` `userId`, `principalType` or `roles` as it read a missing one: authorization treats `roles: null` as no roles and refuses a `null` `principalType`, and a `null` `userId` is not a user id (the `all` authentication mode rejects it).
- **Tokens already issued.** Unchanged: a token minted without the key still decodes without it.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/components/auth/authenticate/services/bearer/abstract.service.ts` | core-server |
