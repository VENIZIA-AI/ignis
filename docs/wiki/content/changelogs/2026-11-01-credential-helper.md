---
title: CredentialHelper hashes and checks passwords with Bun.password
description: "CredentialHelper in @venizia/ignis-helpers hashes and checks passwords with Bun.password, reading bcrypt and argon2 hashes."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-01

## CredentialHelper hashes and checks passwords with Bun.password

<Badge type="tip" text="New Feature" />

**In one line.** `CredentialHelper` in `@venizia/ignis-helpers` hashes and verifies passwords using `Bun.password` without rehashing or migrating existing records.

## What changed

- **New class `CredentialHelper`.** It provides static `hash({ password, algorithm?, cost? })` and `verify({ password, hash })` methods. It requires Bun and throws on other runtimes.
- **Stored formats.** `hash` writes an argon2id hash by default (see [the argon2id entry](/changelogs/2026-11-02-credential-helper-argon2id-default)), and a 60-character bcrypt hash starting with `$2b$` with `algorithm: 'bcrypt'`. `verify` reads bcrypt hashes written by the `bcrypt` npm package as well as argon2 hashes, whichever one `hash` writes. No stored password is rehashed or migrated.
- **Cost configuration.** `cost` applies to bcrypt only: it accepts an integer from 4 to 31 and defaults to 10, and it needs `algorithm: 'bcrypt'`. Invalid costs or non-string passwords throw an error naming the issue.
- **Failure handling.** `verify` returns false for empty or non-string inputs. Corrupt values that are not password hashes throw an error with status 500.
- **Passwords over 72 bytes (bcrypt only).** Bun keeps all bytes, while the `bcrypt` package keeps only the first 72 bytes. argon2id has no such limit.
  - **Reading old hashes.** `verify` retries a bcrypt hash with the first 72 bytes of a longer password, so users whose hash the package wrote can still sign in. The retry is only for those legacy hashes: a hash that `hash` wrote, in either algorithm, is read on the first attempt. The price is that a hash of a password of exactly 72 bytes also accepts that password followed by anything, the way bcrypt always has.
  - **Rolling back.** A bcrypt hash that `hash` writes (with `algorithm: 'bcrypt'`) for a password longer than 72 bytes is read by Bun only. The `bcrypt` package cannot verify it, so going back to that package, or another service that reads the same column, locks those users out. Up to 72 bytes the two read each other's hashes.
- **Documentation and examples.** The docs and the `vert` example now use `CredentialHelper` instead of the `bcrypt` package.

## Who is affected

- **Existing callers.** No action needed. Callers can replace `hash(password, await genSalt())` with `CredentialHelper.hash({ password, algorithm: 'bcrypt' })` to keep writing bcrypt, or with `CredentialHelper.hash({ password })` for argon2id, and `compare(password, hash)` with `CredentialHelper.verify({ password, hash })`.

## Details

```typescript
import { CredentialHelper } from '@venizia/ignis-helpers';

const stored = await CredentialHelper.hash({ password: 'hunter2' });
const ok = await CredentialHelper.verify({ password: 'hunter2', hash: stored });
```
