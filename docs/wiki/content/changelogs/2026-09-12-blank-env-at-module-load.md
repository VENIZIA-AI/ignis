---
title: A Blank Env Line No Longer Beats Its Default At Module Load
description: Ten framework reads of process.env no longer treat an empty line as a value, and a new blankToUndefined helper is exported.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-12

## A blank env line no longer beats its default at module load

<Badge type="warning" text="Fix" />

**In one line.** Ten framework constants read `process.env` directly with `??`, which an empty string walks straight past. A blank line now means "use the default".

```ts
// APP_ENV_APPLICATION_TIMEZONE=      (present, empty)
// before: ''      after: 'Asia/Ho_Chi_Minh'
```

## What changed

- **`APPLICATION_ENV_PREFIX=` empty is safe.** The prefix became `''`, every name matched, and the environment map held the whole of `process.env`. Boot then failed on the first unrelated empty system variable, and `applicationEnvironment.keys()` published the names of every host secret.
- **Ten reads fixed.** In `@venizia/ignis-helpers`: `APPLICATION_ENV_PREFIX`, `APP_ENV_APPLICATION_TIMEZONE`, and five winston plus one pino logger settings. In `@venizia/ignis`: `APP_ENV_APPLICATION_NAME` and every name the startup banner prints.
- **`blankToUndefined`.** New, exported from the root barrel and from `@venizia/ignis-helpers/core`. It answers `undefined` for `undefined`, `''` and whitespace, and a trimmed string otherwise. Prefer it to `||`, which also swallows `'0'`.

```ts
import { blankToUndefined } from '@venizia/ignis-helpers/core';

const host = blankToUndefined(process.env.APP_ENV_REDIS_HOST) ?? 'localhost';
```

`applicationEnvironment.get(key, { defaultValue })` already treats a blank line as missing and needs no wrapper.

## Who is affected

- **You leave these names unset.** Nothing changes.
- **A deployment of yours sets one of them to empty.** You now get the documented default instead of a blank.
- **You set `APPLICATION_ENV_PREFIX` to a real prefix.** Unchanged.
