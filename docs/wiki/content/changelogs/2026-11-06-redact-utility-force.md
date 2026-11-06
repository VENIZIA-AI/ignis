---
title: RedactUtility can mask even when the logger switch is off
description: "RedactUtility.redactSecrets, redactUrlCredentials and toJsonSafe take force: true, which masks whatever APP_ENV_LOGGER_DO_REDACT says. The logger keeps following the switch."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## RedactUtility can mask even when the logger switch is off

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** Pass `force: true` to `RedactUtility.redactSecrets`, `redactUrlCredentials` or `toJsonSafe` and the value is masked even when `APP_ENV_LOGGER_DO_REDACT=false`. A project no longer needs its own always-on redactor for data that must never leave unmasked.

## What changed

- **A `force` option.** `APP_ENV_LOGGER_DO_REDACT=false` is a debugging switch for log lines. A payment record or personal data written to a file or sent to a third party must be masked whatever the switch says; `force: true` does that.
- **The logger is unchanged.** It never passes `force`, so the switch still turns log masking off for local debugging, and without `force` the three methods behave as before.

## Who is affected

- **Code that sends data outside the process and relied on `RedactUtility` for masking.** Add `force: true` so a debugging switch left on cannot unmask it.
- **Everyone else.** No action needed.

## Details

```ts
import { RedactUtility } from '@venizia/ignis-helpers/common';

const safe = RedactUtility.redactSecrets({ value: invoice, force: true });
```

| File | Package |
|------|---------|
| `src/common/redact.ts` | helpers |
