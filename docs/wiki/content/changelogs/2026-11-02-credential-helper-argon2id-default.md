---
title: CredentialHelper.hash writes argon2id by default
description: "CredentialHelper.hash in @venizia/ignis-helpers now writes argon2id unless you pass algorithm: 'bcrypt'."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-02

## CredentialHelper.hash writes argon2id by default

<Badge type="warning" text="Behavior Change" />

**In one line.** `CredentialHelper.hash` in `@venizia/ignis-helpers` now writes an argon2id hash instead of a bcrypt hash; pass `algorithm: 'bcrypt'` to keep writing bcrypt.

## What changed

- **New option `algorithm`.** `hash({ password, algorithm?, cost? })` takes `'argon2id'` or `'bcrypt'`. The default is `'argon2id'`, with the default parameters of `Bun.password` (`m=65536, t=2, p=1`). The output starts with `$argon2id$`. Before, it always started with `$2b$`.
- **Why.** `Bun.password.hash` writes argon2id by default. An application that already stores argon2id and adopted `hash` would have moved every new and reset password to the weaker bcrypt, mixed into one column.
- **`cost` is for bcrypt only.** It is an integer from 4 to 31, default 10. Passing `cost` with argon2id, by default or by name, throws an error that says to pass `algorithm: 'bcrypt'`. It is not ignored. An unknown `algorithm` throws too.
- **`verify` is unchanged.** It reads bcrypt (including the 72-byte retry for hashes the `bcrypt` package wrote) and argon2 hashes. Hashes already stored keep working and nothing is rehashed.
- **No 72-byte limit for argon2id.** The 72-byte notes apply to bcrypt hashes only.

## Who is affected

- **Callers of `hash` that pass no `algorithm`.** New hashes are argon2id. To keep writing bcrypt, pass `algorithm: 'bcrypt'`.
- **Callers that pass `cost`.** Add `algorithm: 'bcrypt'`, or `hash` throws.
- **Stored hashes.** Not affected.

## Details

```typescript
import { CredentialHelper } from '@venizia/ignis-helpers';

// argon2id, the default
const stored = await CredentialHelper.hash({ password: 'hunter2' });

// bcrypt, as before
const legacy = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'bcrypt', cost: 12 });

// refused: cost applies to bcrypt only
await CredentialHelper.hash({ password: 'hunter2', cost: 12 });
```
