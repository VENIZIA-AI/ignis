---
title: RedactUtility can mask even when the logger switch is off
description: "RedactUtility.redactSecrets, redactUrlCredentials and toJsonSafe take force: true, which masks whatever APP_ENV_LOGGER_DO_REDACT says. The logger keeps following the switch."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## RedactUtility can mask even when the logger switch is off

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** Pass `force: true` to `RedactUtility.redactSecrets`, `redactUrlCredentials` or `toJsonSafe` and secret-looking keys are masked even when `APP_ENV_LOGGER_DO_REDACT=false`. A project no longer needs its own always-on switch around the redactor for a copy it logs or inspects.

## What changed

- **A `force` option.** `APP_ENV_LOGGER_DO_REDACT=false` is a debugging switch for log lines. `force: true` keeps the key masking on whatever the switch says.
- **What it does not do.** Keys are matched by name (`password`, `token`, `apiKey`, ...), so a card number under `number` is not masked. The result is the log-shaped copy: long strings are cut, a second reference to one object reads `[Circular]`, binary and `Map` values are summarized. It is not a faithful redacted document to write to a file or send on.
- **The logger is unchanged.** It never passes `force`, so the switch still turns log masking off for local debugging, and without `force` the three methods behave as before.

## Who is affected

- **Code that masks a copy it logs or inspects with `RedactUtility`.** Add `force: true` so a debugging switch left on cannot unmask it.
- **Everyone else.** No action needed.

## Details

```ts
import { RedactUtility } from '@venizia/ignis-helpers/common';

const safe = RedactUtility.redactSecrets({ value: invoice, force: true });
```

| File | Package |
|------|---------|
| `src/common/redact.ts` | helpers |
