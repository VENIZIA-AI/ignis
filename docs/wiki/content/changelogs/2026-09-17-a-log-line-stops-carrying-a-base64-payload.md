---
title: A Log Line Stops Carrying a Base64 Payload
description: "Long strings are capped in the shared sanitiser, with the original length kept in the marker. Stack traces are exempt."
---

# Changelog - 2026-09-17

## Long strings are capped in every log line

<Badge type="tip" text="Fix" />

A request body carrying `data:image/png;base64,...` turned one log line into hundreds of kilobytes,
and none of it was readable.

```
{"image":"data:image/png;base64,iVBORw0KG... [truncated, 302144 chars total]"}
```

The **original length stays in the marker**. That number is what tells you the field held a 300 KB
image rather than a truncated sentence.

| | |
|---|---|
| Default | 2048 characters |
| Turn it off | `APP_ENV_LOGGER_MAX_STRING_LENGTH=0` |
| Never capped | `stack`, `stacktrace`, `stack_trace` |

A stack trace is long by nature and useless cut - it is the whole reason the line is being read.

## Where it sits, and why not in the middleware

In `deepSanitize`, the one walk `redactSecrets` and `toJsonSafe` both go through. Every log call has
the same exposure; `RequestSpyMiddleware` is only where it was noticed.

Capping is **structural**, so `APP_ENV_LOGGER_DO_REDACT=false` does not disable it. That switch is
about masking secret-shaped keys, never about letting a 300 KB payload onto a line.

## Who is affected

**You log large strings deliberately.** Raise or disable the limit.

**Everyone else.** Smaller logs, same content.

**Files:**

- [`packages/helpers/src/common/redact.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/redact.ts)
