---
title: Redaction covers more credential names and the credentials inside string values
description: "RedactUtility masks signing and encryption keys, session and one-time values, signatures, card and national-id numbers and the kebab spellings of tokens, and it scrubs url passwords, bearer credentials and credential query parameters inside strings. The request log masks the OAuth callback code and state."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## Redaction covers more credential names and the credentials inside string values

<Badge type="danger" text="Security" /> <Badge type="info" text="Enhancement" />

**In one line.** The logger and the error handler mask more secret-looking keys, and they now look inside string values: the password of a connection url, a bearer token and credential query parameters no longer reach a log line under a harmless key.

## What changed

- **More names.** `secretAccessKey`, `signingKey`, `encryptionKey`, `masterKey`, `hmacKey`, `accountKey`, `storageKey`, `licenseKey`, `jwt`, `sessionId`, `sid`, `signature`, `sig`, `otp`, `totp`, `cvv`, `cvc`, `cardNumber`, `ssn`, `nationalId`, `passwd`, `pwd`, `passcode`, `redisUrl`, `mongoUri`, `authorization_code`, the `x-amz-*` signature and token headers, and the kebab spellings `id-token`, `refresh-token`, `client-secret`, `private-key` are masked. An explicit list: `primaryKey`, `cacheKey`, `code` and `pin` stay visible.
- **Inside strings.** `scheme://user:password@host`, `Bearer ...` / `Basic ...` and `?access_token=...` style parameters are scrubbed wherever they sit in a string, a thrown `Error` message and stack included. Text without them is unchanged. With `APP_ENV_LOGGER_DO_REDACT=false` and no `force`, nothing is scrubbed, as before.
- **String log arguments.** A string passed to the logger (`logger.info('connecting to %s', url)`) is scrubbed the same way. The scrub is linear in the length of the string. A url whose userinfo has no password (`https://<token>@host`), a `#fragment` or `, password=...` list entry, and `key=` / `auth=` parameters are covered. Free text is best effort: a credential inside a JSON document held in a string, or in a `Cookie:` value, is not recognised.
- **The request log.** The OAuth callback parameters `code` and `state` are masked in the logged query string.

## Who is affected

- **Anyone reading logs for those values while debugging.** They read `[REDACTED]` now; set `APP_ENV_LOGGER_DO_REDACT=false` locally to see them.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/common/redact.ts` | helpers |
| `src/base/middlewares/request-spy/request-spy.middleware.ts` | core-server |
