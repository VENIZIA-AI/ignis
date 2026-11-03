---
title: A Log Line Stops Carrying a Base64 Payload
description: "Long strings are capped in every log line, with the original length kept in the marker; stack traces are exempt."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-17

## Long strings are capped in every log line

<Badge type="tip" text="Fix" />

**In one line.** A request body carrying `data:image/png;base64,...` used to turn one log line into hundreds of kilobytes. Long strings are now cut.

```
{"image":"data:image/png;base64,iVBORw0KG... [truncated, 302144 chars total]"}
```

## What changed

- **Default cap: 2048 characters.** The original length stays in the marker, so you can tell a 300 KB image from a truncated sentence.
- **Turn it off.** `APP_ENV_LOGGER_MAX_STRING_LENGTH=0`.
- **Never capped.** `stack`, `stacktrace` and `stack_trace`.
- **`APP_ENV_LOGGER_DO_REDACT=false` does not disable it.** That switch is about masking secret-shaped keys only.

## Who is affected

- **You log large strings deliberately.** Raise or disable the limit.
- **Everyone else.** Smaller logs, same content.
