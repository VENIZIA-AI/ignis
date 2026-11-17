---
title: The derived-key cache of the AES and RSA helpers is bounded and keyed by a digest
description: "The cache of PBKDF2-derived keys keeps at most 64 entries, evicting the least recently used, and no longer keys its entries by the plaintext secret."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## The derived-key cache of the AES and RSA helpers is bounded and keyed by a digest

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** The cache that remembers PBKDF2-derived keys grew with every distinct secret and held each secret as part of its key. It keeps 64 entries now, and its keys are a digest of the inputs.

## What changed

- **Bounded.** At most 64 derived keys are kept; the least recently used goes first. A key in use stays.
- **No secret in the key.** The map key is a SHA-256 digest of the derivation inputs, so the secret is not retained as a string beyond the call.
- **Behaviour is unchanged.** A repeated derivation still shares one result, also while it runs, and a failed derivation is not kept. The derived bytes are the same.

## Who is affected

- **Services that encrypt with a secret supplied per request.** Memory no longer grows with the number of distinct secrets.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/derived-key-cache.ts` | helpers |
| `src/modules/crypto/algorithms/base.algorithm.ts` | helpers |
