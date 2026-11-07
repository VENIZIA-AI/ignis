---
title: A service assertion is not a user token, and stricter checks of the JWT options
description: "The user-token path refuses a token with typ svc+jwt, and a boot with a verify option that is not an object, or with the algorithm none, is refused."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-07

## A service assertion is not a user token, and stricter checks of the JWT options

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A JWKS issuer that shares its key with the service assertions, under names that match, would accept a service assertion as a user token. The user-token path now refuses it, and two odd JWT options refuse the boot instead of being ignored.

## What changed

- **Service assertions.** Bearer and JWKS verification refuse a token whose header `typ` is `svc+jwt` (also `SVC+JWT` and `application/svc+jwt`), with `401`. Service assertions are still verified by the service strategy.
- **`verify` must be an object.** A `verify` option that is a string, a number, a list or `null` refuses the boot. It used to be ignored, and its checks (`maxTokenAge`, `subject`) vanished without a word.
- **No `none`.** The algorithm `none` refuses the boot, as `headerAlgorithm` or in `verify.algorithms`. A token with no signature never verified; now the configuration says so at start.

## Who is affected

- **Applications that share a key between the service assertions and a JWKS issuer.** An assertion no longer works as a user token. Nothing else changes for them.
- **Applications with a `verify` option that is not an object, or `headerAlgorithm: 'none'`.** They stop booting; fix the option.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/components/auth/authenticate/services/bearer/abstract.service.ts` | core |
