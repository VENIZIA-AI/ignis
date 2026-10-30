---
title: Empty Env Values Are Allowed By Default
description: validateEnvs no longer refuses to boot over an empty environment value; set ALLOW_EMPTY_ENV_VALUE to false or 0 to turn the check back on.
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-12

## Empty env values are allowed by default

<Badge type="danger" text="Breaking" />

**In one line.** `validateEnvs()` used to throw on the first prefixed env name whose value was empty, and you opted out with `ALLOW_EMPTY_ENV_VALUE`. The default is now the other way round.

## What changed

| `ALLOW_EMPTY_ENV_VALUE` | Behaviour |
|---|---|
| unset | Empty values allowed. This is the default |
| blank (`ALLOW_EMPTY_ENV_VALUE=`) | Reads as unset, so allowed |
| `false` or `0` | Every prefixed key must be non-empty. Boot throws on the first that is not |
| anything else | Allowed |

- **Why.** `applicationEnvironment.get()` now treats `KEY=` as missing and falls back to `defaultValue` (see [An Env Read Now Does What It Promises](./2026-09-12-env-reads-what-it-promises)), so the empty value is handled where it is read.
- **The startup banner** reports which way it resolved.
- **No declaration needed.** `ALLOW_EMPTY_ENV_VALUE` and `APPLICATION_ENV_PREFIX` are both optional and are read straight off `process.env`. They do not carry the `APP_ENV` prefix, so do not add them to `EnvironmentKeys`; a read through `AppEnvs.get()` would answer `undefined` forever. Unset, you get `APP_ENV` as the prefix and empty values allowed.

## Who is affected

- **You relied on boot failing when an env value was empty.** It no longer does. Set `ALLOW_EMPTY_ENV_VALUE=false` to keep that behaviour.
- **You already set `ALLOW_EMPTY_ENV_VALUE` to something truthy.** Nothing changes. You can delete the line.
- **Everyone else.** Nothing. A populated value has always passed.

## Breaking changes

> [!WARNING]
> Anyone who relied on the boot failure over an empty env value.

**Before:** an empty prefixed value threw at boot unless `ALLOW_EMPTY_ENV_VALUE` was truthy.

**After:** empty values pass unless you set:

```bash
ALLOW_EMPTY_ENV_VALUE=false
```
