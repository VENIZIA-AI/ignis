---
title: Log Arguments Under `%j` No Longer Collapse to `[Circular]`
description: A %j log argument with a cycle now prints its real fields, redacts secret keys, and caps depth, instead of collapsing to the single token [Circular].
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-08-12

## Log Arguments Under `%j` No Longer Collapse to `[Circular]`

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A `%j` log argument that carries a transaction, a connector or a request context now prints its real fields instead of the single token `[Circular]`.

## What changed

- **Cycles collapse per branch.** Only the offending reference prints `"[Circular]"`; every sibling field survives.
- **Secret-looking keys are redacted under `%j`,** as they already were under `%s`. Passwords and tokens in a `%j` payload previously reached the log in clear.
- **The walk is depth-capped** by `APP_ENV_LOGGER_INSPECT_DEPTH` (default `5`). Below the cap a value prints `"[Object]"`.
- **An `Error` under `%j` keeps its `message` and `stack`.** It used to render as `{}`.
- **A `Date` no longer flattens to `{}` under `%s`.**

```text
Args: [{"id":"user-1","data":{"username":"phatnt","password":"[REDACTED]"},"transaction":
{"connector":{"query":{"users":"[Object]"},"session":{"dialect":"[Circular]","client":
"[Object]"}},"isActive":true}}]
```

## Who is affected

- **Anyone logging with `%j`.** No action needed. Lines that printed `[Circular]` now print data, and deep payloads truncate at depth 5.
- **Anyone parsing log lines downstream.** A `%j` field can now hold `"[Circular]"`, `"[Object]"`, `"[Array]"` or `"[Binary N bytes]"` as a string value.
- **Anyone logging an `Error` with `%j`.** The line grows: it now carries `message`, `stack` and every enumerable own property. Use `%s` for errors - only `%s` routes through `ErrorPrettier`.

## Details

- `%o`, `%O` and arguments with no placeholder are still handed to `util.format` untouched, so they are not redacted. Bind anything that may carry a credential to `%s` or `%j`.
- A payload holding a live handle still prints noise. Keep transactions and request contexts out of the logged arguments.
- `toJsonSafe` is exported for the same projection outside the logger:

```typescript
import { toJsonSafe } from '@venizia/ignis-helpers';

const safe = toJsonSafe({ value: payload, depth: 5 });
```
