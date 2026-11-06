---
title: Redaction masks a key named credential and its prefixed forms
description: "RedactUtility and the logger now mask the values of credential, dbCredential, api_credential and their plural forms, as they already did for credentials, a token or a secret."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## Redaction masks a key named credential and its prefixed forms

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** A value under the key `credential` (singular), `dbCredential`, `api_credential` or a plural such as `dbCredentials` is now replaced with `[REDACTED]`. Only `credentials` was masked before, so these keys reached the log in clear.

## What changed

- **The bare key.** `credential` joins `credentials` in the list of masked key names.
- **The prefixed forms.** Any key that ends in `_credential`, `Credential`, `_credentials` or `Credentials` is masked, the way keys ending in `Token` and `Secret` already were.
- **Where it applies.** Every caller of `RedactUtility.redactSecrets` and `toJsonSafe`, with or without `force`, and so the logger and the fetchers that redact a request config.

## Who is affected

- **Code that logs or inspects an object holding a `credential`-style key.** The value now reads `[REDACTED]`. A key that only contains the word, such as `credentialType`, is not masked.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/common/redact.ts` | helpers |
