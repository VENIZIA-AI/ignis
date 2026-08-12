---
title: Log Arguments Under `%j` No Longer Collapse to `[Circular]`
description: A single cyclic reference in a `%j` argument used to erase the whole payload. The formatter now projects the argument first, so cycles collapse per branch, secret keys are redacted, and the walk is depth-capped.
---

# Changelog - 2026-08-12

## Log Arguments Under `%j` No Longer Collapse to `[Circular]`

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A `%j` log argument that carries a transaction, a connector or a request context now prints its real fields instead of the single token `[Circular]`.

## The problem it solves

`%j` formats through `JSON.stringify`, which gives up on the **whole** argument as soon as one cycle sits anywhere inside it. A payload is mostly plain data, so the loss is total and silent:

```typescript
logger.debug('Updating user | Args: %j', { id, data, transaction });
// [UserService] [updateById] START | Executing... | Args: [Circular]
```

The `id` and the `data` were never cyclic. The transaction handle holds a live connector, which references its own session, which references it back - and that one edge took the rest of the line with it.

## What changed

- **Cycles collapse per branch.** Only the offending reference prints `"[Circular]"`; every sibling field survives.
- **Secret-looking keys are redacted under `%j`**, exactly as they already were under `%s`. Passwords and tokens in a `%j` payload previously reached the sink in clear.
- **The walk is depth-capped** by `APP_ENV_LOGGER_INSPECT_DEPTH` (default `5`), so a live connector cannot flood one line. Below the cap a value prints `"[Object]"`.
- **An `Error` under `%j` keeps its `message` and `stack`.** `JSON.stringify` alone rendered it as `{}`, since both fields are non-enumerable.
- **A `Date` no longer flattens to `{}` under `%s`.**

The same line now reads:

```text
Args: [{"id":"user-1","data":{"username":"phatnt","password":"[REDACTED]"},"transaction":
{"connector":{"query":{"users":"[Object]"},"session":{"dialect":"[Circular]","client":
"[Object]"}},"isActive":true}}]
```

## Who is affected

- **Anyone logging with `%j`.** No action needed. Lines that printed `[Circular]` now print data, and deep payloads truncate at depth 5 rather than running unbounded.
- **Anyone parsing log lines downstream.** A `%j` field that used to be absent (or the literal `[Circular]`) can now hold `"[Circular]"`, `"[Object]"`, `"[Array]"` or `"[Binary N bytes]"` as a **string** value.
- **Anyone logging an `Error` with `%j`.** The line grows: it now carries `message`, `stack` and every enumerable own property. `%s` remains the rule for errors - only `%s` routes through `ErrorPrettier`, which projects unmodelled properties away.

## Details

`%o`, `%O` and arguments with no placeholder at all are still handed to `util.format` untouched, so they are **not** redacted. Bind anything that may carry a credential to `%s` or `%j`.

A payload holding a live handle still prints noise. Keep transactions and request contexts out of the logged arguments:

```typescript
// Prefer
logger.debug('Updating user | Args: %j', { id, data });
```

`toJsonSafe` is exported for the same projection outside the logger:

```typescript
import { toJsonSafe } from '@venizia/ignis-helpers';

const safe = toJsonSafe({ value: payload, depth: 5 });
```

| File | Package |
|------|---------|
| `src/common/redact.ts` | helpers |
| `src/modules/logger/formatting/deep-splat.ts` | helpers |
