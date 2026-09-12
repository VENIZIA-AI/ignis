---
title: An Env Read Now Does What It Promises
description: A present-but-empty line finally falls back to defaultValue, and the two env names nothing ever read are deleted from EnvironmentKeys.
---

# Changelog - 2026-09-12

## An env read now does what it promises

<Badge type="warning" text="Fix" />
<Badge type="danger" text="Breaking" />

**In one line.** `APP_ENV_HOST=` in a deployment file used to read as `''`, which passed every
falsy guard and then failed later at connect time with an unrelated message.

```ts
// APP_ENV_SERVER_PORT=      (present, empty)

applicationEnvironment.get('APP_ENV_SERVER_PORT', { defaultValue: '3000' });
// before: ''      after: '3000'
```

## Empty means missing, but only where you asked for a default

The normalisation runs **only when the call supplies a `defaultValue`**. That call site has already
declared what it wants when the name carries nothing, so applying the default is the stated intent.

```ts
applicationEnvironment.get('APP_ENV_EMPTY');                            // still '' - unchanged
applicationEnvironment.get('APP_ENV_EMPTY', { defaultValue: 'x' });     // 'x'
```

A read with no `defaultValue` is untouched, so no existing call changes shape. Whitespace counts as
empty too - `APP_ENV_HOST=   ` is a hand-edited file, not a value. `'0'` and `'false'` are values and
are never normalised.

`transform` is covered by the same rule, which is the half that is easy to miss. It now receives
`undefined` rather than `''`, so a transform written to parse a real value no longer has to guard
against the empty string:

```ts
applicationEnvironment.get('APP_ENV_NODES', {
  defaultValue: [],
  transform: raw => raw.split(','),   // raw is undefined, never '', when the line is empty
});
```

## Put the fallback inside the read

`int()` is unchanged and stays total: it always answers a number, and answers `0` for anything it
cannot parse. That makes `??` after it dead code.

```ts
int(applicationEnvironment.get(KEY, { defaultValue: '6379' }));  // correct
int(applicationEnvironment.get(KEY)) ?? 6379;                    // always 0 when KEY is unset
```

The broken form is silent, and the harm is not the port. A retry budget that reads `0` means
`AbstractRedisHelper.buildRetryStrategy` gives up after the first reconnect failure instead of
retrying.

## Two env names with no reader are gone

<Badge type="danger" text="Breaking" />

`EnvironmentKeys.APP_ENV_OAUTH2_VIEW_FOLDER` and `EnvironmentKeys.APP_ENV_DATASOURCE_NAME` are
deleted. `EnvironmentKeys` now holds 15 names: 5 the framework reads, 10 conventions your own code
reads.

This finishes the audit that removed the `APP_ENV_APPLICATION_DS_*` family on
[2026-09-11](./2026-09-11-build-info-and-health-stats). Every remaining name was grepped for a real
reader across IGNIS, its examples, and the largest consumer application, excluding the declaration
itself and generated `dist` output.

| Name | Readers | Verdict |
|------|---------|---------|
| `APP_ENV_POSTGRES_*` (5 names) | 34 to 46 each | Keep |
| `APP_ENV_APPLICATION_SECRET` | 36 | Keep |
| `APP_ENV_SERVER_BASE_PATH` | 9 | Keep |
| `APP_ENV_APPLICATION_ROLES`, `APP_ENV_JWT_EXPIRES_IN` | 5 each | Keep |
| `APP_ENV_JWT_SECRET` | 1 | Keep |
| `APP_ENV_OAUTH2_VIEW_FOLDER` | **0** | Deleted |
| `APP_ENV_DATASOURCE_NAME` | **0** | Deleted |

`APP_ENV_JWT_SECRET` is why this was measured rather than guessed. It has one reader, in
`examples/supabase/src/application.ts`, and a count taken from the consumer application alone would
have read zero and deleted a live name.

`APP_ENV_DATASOURCE_NAME` is the more instructive of the two. It sat in example `.env` files set to
a plausible `pg_core`, which is exactly what `APP_ENV_APPLICATION_DS_MIGRATION` did before it. A name
that looks configured and is read by nobody is worse than a missing one: it tells an operator a
decision has been made.

## Who is affected

**You read an env name that a deployment sets empty.** You now get your `defaultValue` instead of
`''`. This is the fix, but it is a behaviour change - if any of your code treats `''` as a
meaningful value AND passes a `defaultValue` for that same read, it now takes the default.

**You call `get()` without a `defaultValue`.** Nothing changes, at all.

**You set `APP_ENV_OAUTH2_VIEW_FOLDER` or `APP_ENV_DATASOURCE_NAME`.** Delete the line. Leaving it
is harmless; nothing reads it now, and nothing read it before.

**You reference either name in TypeScript.** That no longer compiles. The measurement above found no
such line anywhere - but if yours is the exception, declare the name in your own `EnvironmentKeys`
subclass, the way an application already extends it for its own names.

**Files:**

- [`packages/helpers/src/modules/env/app-env.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/env/app-env.ts) - `ApplicationEnvironment`
- [`packages/helpers/src/utilities/parse.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/parse.utility.ts) - `int`
- [`packages/core-server/src/common/environments.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/common/environments.ts) - `EnvironmentKeys`
