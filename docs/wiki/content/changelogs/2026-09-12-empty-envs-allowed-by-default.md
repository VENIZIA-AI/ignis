---
title: Empty Env Values Are Allowed By Default
description: validateEnvs no longer refuses to boot over an empty environment value. Set ALLOW_EMPTY_ENV_VALUE to false or 0 to turn the check back on.
---

# Changelog - 2026-09-12

## Empty env values are allowed by default

<Badge type="danger" text="Breaking" />

**In one line.** `validateEnvs()` used to throw on the first prefixed env name whose value was empty,
and you opted out with `ALLOW_EMPTY_ENV_VALUE`. The default is now the other way round.

| `ALLOW_EMPTY_ENV_VALUE` | Behaviour |
|---|---|
| unset | Empty values allowed. `validateEnvs` skips. **This is the default** |
| blank (`ALLOW_EMPTY_ENV_VALUE=`) | Reads as unset, so allowed |
| `false` or `0` | Every prefixed key must be non-empty. Boot throws on the first that is not |
| anything else | Allowed |

## Why the default moved

Earlier today `applicationEnvironment.get()` learned that
[a present-but-empty line means missing](./2026-09-12-env-reads-what-it-promises): `KEY=` now falls
back to `defaultValue`. An empty value is handled where it is read.

That made the boot check redundant and then actively unhelpful. It refused to start an application
over a value the reader would have resolved a millisecond later, and it did so for **every** prefixed
name, including the ones that are conventions rather than requirements. Refusing to boot is a strong
move; it should be something a host asks for.

Nothing stops you asking:

```bash
ALLOW_EMPTY_ENV_VALUE=false
```

The startup banner reports which way it resolved, so the log says what the host chose rather than
leaving you to infer it.

## Neither bootstrap variable needs declaring

Both `ALLOW_EMPTY_ENV_VALUE` and `APPLICATION_ENV_PREFIX` are optional, and neither belongs in
`EnvironmentKeys`.

Putting them there would be a trap. Neither carries the `APP_ENV` prefix, so `applicationEnvironment`
never holds them, and a read through `AppEnvs.get()` answers `undefined` forever.
`APPLICATION_ENV_PREFIX` could not work that way regardless: it is the value that builds the filter,
so reading it through its own filter is circular. Both are read straight off `process.env`, which is
the one legitimate exception to the "do not read `process.env` directly" rule.

Leave them unset and you get `APP_ENV` as the prefix and empty values allowed.

## Who is affected

**You relied on boot failing when an env value was empty.** It no longer does. Set
`ALLOW_EMPTY_ENV_VALUE=false` to keep that behaviour. This is the only reason this entry is marked
breaking.

**You already set `ALLOW_EMPTY_ENV_VALUE` to something truthy.** Nothing changes. You can delete the
line - it is the default now.

**Everything else.** Nothing. A populated value has always passed and still does.

**Files:**

- [`packages/core-server/src/base/applications/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/applications/base.ts) - `validateEnvs`, `printStartUpInfo`
- [`packages/core-server/src/common/environments.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/common/environments.ts) - `EnvironmentKeys`
