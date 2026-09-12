---
title: A Blank Env Line No Longer Beats Its Default At Module Load
description: Ten framework reads of process.env treated an empty line as a value. The worst of them turned the whole of process.env into the application environment map.
---

# Changelog - 2026-09-12

## A blank env line no longer beats its default at module load

<Badge type="warning" text="Fix" />

**In one line.** The [earlier fix today](./2026-09-12-env-reads-what-it-promises) taught
`applicationEnvironment.get()` that `KEY=` means missing. Ten framework constants never went through
`get()` - they read `process.env` directly at module load, with `??`, which an empty string walks
straight past.

```ts
// APP_ENV_APPLICATION_TIMEZONE=      (present, empty)
const tz = process.env.APP_ENV_APPLICATION_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
// before: ''      after: 'Asia/Ho_Chi_Minh'
```

## The one that matters most has nothing to do with formatting

`ApplicationEnvironment` filters `process.env` by a prefix, and that prefix was read the same way:

```ts
prefix: process.env.APPLICATION_ENV_PREFIX ?? 'APP_ENV';
```

Export `APPLICATION_ENV_PREFIX=` empty and the prefix becomes `''`. Every name starts with the empty
string, so the map stops filtering:

```
prefix blank  -> keys: APP_ENV_A, PATH, HOME, AWS_SECRET_ACCESS_KEY, ...
prefix normal -> keys: APP_ENV_A
```

Two things follow. `validateEnvs` iterates exactly that list, so boot fails on the first unrelated
empty system variable rather than on anything you configured. And `applicationEnvironment.keys()`
starts publishing the names of every secret on the host.

## What changed, and a new export you can use

Each of the ten reads now treats a blank line as absent, whitespace included:

```ts
blankToUndefined(process.env.APP_ENV_LOGGER_FORMAT) ?? 'text';
```

| Where | Names |
|-------|-------|
| `@venizia/ignis-helpers` | `APPLICATION_ENV_PREFIX`, `APP_ENV_APPLICATION_TIMEZONE`, and five winston plus one pino logger settings |
| `@venizia/ignis` | `APP_ENV_APPLICATION_NAME`, and every name the startup banner prints |

`blankToUndefined` is new, and exported - from the root barrel and from
`@venizia/ignis-helpers/core`, since it is pure. It answers `undefined` for `undefined`, `''` and
whitespace, and a trimmed string otherwise:

```ts
import { blankToUndefined } from '@venizia/ignis-helpers/core';

const host = blankToUndefined(process.env.APP_ENV_REDIS_HOST) ?? 'localhost';
```

The obvious shorter fix, `process.env.X || 'text'`, was written first and rejected by this
repository's own `@typescript-eslint/prefer-nullish-coalescing` rule - correctly, because `||` also
swallows `'0'`. Reach for `blankToUndefined` instead of `||` for exactly that reason: it says
"blank", not "falsy", so a numeric setting where zero is meaningful stays safe.

An environment value read through `applicationEnvironment.get(key, { defaultValue })` already gets
this treatment and needs no wrapper.

## Who is affected

**You leave these names unset.** Nothing changes. `??` and `||` agree on `undefined`.

**A deployment of yours sets one of them to empty.** You now get the documented default instead of a
blank, which is what the empty line was always trying to say.

**You set `APPLICATION_ENV_PREFIX` to a real prefix.** Unchanged, still honoured.

**Files:**

- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `resolveApplicationEnvironment`
- [`packages/helpers/src/utilities/date.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/date.utility.ts) - the default timezone
- [`packages/helpers/src/modules/logger/winston/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/winston/common/constants.ts) - the file-rotation settings
- [`packages/core-server/src/base/applications/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/applications/base.ts) - `printStartUpInfo`
