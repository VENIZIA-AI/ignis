---
title: An Env Read Now Does What It Promises
description: A present-but-empty env line now falls back to defaultValue, and two env names nothing ever read are deleted from EnvironmentKeys.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-12

## An env read now does what it promises

<Badge type="warning" text="Fix" /> <Badge type="danger" text="Breaking" />

**In one line.** `APP_ENV_HOST=` in a deployment file used to read as `''`, which passed every falsy guard and then failed later with an unrelated message. It now falls back to your `defaultValue`.

```ts
// APP_ENV_SERVER_PORT=      (present, empty)

applicationEnvironment.get('APP_ENV_SERVER_PORT', { defaultValue: '3000' });
// before: ''      after: '3000'
```

## What changed

- **Only where you asked for a default.** The normalisation runs only when the call supplies a `defaultValue`. A read without one is untouched. Whitespace counts as empty; `'0'` and `'false'` are values and are never normalised.
- **`transform` gets `undefined`.** For an empty line a `transform` now receives `undefined`, not `''`, so it no longer has to guard against the empty string.
- **Put the fallback inside the read.** `int()` is unchanged: it always answers a number, and answers `0` for anything it cannot parse, so `??` after it is dead code. A retry budget that reads `0` makes `AbstractRedisHelper.buildRetryStrategy` give up after the first reconnect failure.

```ts
int(applicationEnvironment.get(KEY, { defaultValue: '6379' }));  // correct
int(applicationEnvironment.get(KEY)) ?? 6379;                    // always 0 when KEY is unset
```

- **Two env names deleted (Breaking).** `EnvironmentKeys.APP_ENV_OAUTH2_VIEW_FOLDER` and `EnvironmentKeys.APP_ENV_DATASOURCE_NAME` had no reader anywhere. `EnvironmentKeys` now holds 15 names: 5 the framework reads, 10 conventions your own code reads.

## Who is affected

- **You read an env name that a deployment sets empty.** You now get your `defaultValue` instead of `''`. If any of your code treats `''` as meaningful AND passes a `defaultValue` for that same read, it now takes the default.
- **You call `get()` without a `defaultValue`.** Nothing changes.
- **You set `APP_ENV_OAUTH2_VIEW_FOLDER` or `APP_ENV_DATASOURCE_NAME`.** Delete the line. Leaving it is harmless.
- **You reference either name in TypeScript.** That no longer compiles. Declare the name in your own `EnvironmentKeys` subclass.

## Breaking changes

> [!WARNING]
> Code that references `EnvironmentKeys.APP_ENV_OAUTH2_VIEW_FOLDER` or `EnvironmentKeys.APP_ENV_DATASOURCE_NAME` no longer compiles.

**Before:** both names exist on `EnvironmentKeys`.

**After:** they are gone. Declare the name in your own `EnvironmentKeys` subclass if you need it.
