---
title: The error response redacts extra and carries none for server errors in production
description: "The extra of an error is rendered through the redaction the log line already used, always masking in production, and a 5xx in production carries no extra. A cycle or a BigInt in extra no longer turns the authored status into a 500."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The error response redacts extra and carries none for server errors in production

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** The `extra` of an error response goes through the same redaction as the log line, and a server error (5xx) in production carries no `extra`.

## What changed

- **Redacted.** `extra` is whatever a throw site attached to the error. The log line already masked secret-shaped keys in it; the response now does the same, and in production it masks whatever `APP_ENV_LOGGER_DO_REDACT` says.
- **None for a 5xx in production.** The log has the context; a client has no use for it. A client error (4xx) keeps its `extra`, masked, because validation and conflict details are meant for the caller. Outside production every status keeps it, masked.
- **No more degraded status.** A cycle in `extra` used to make the response fail and fall back to a plain 500; it now reads `[Circular]` and a BigInt becomes text, so the status the throw site chose is the status the client gets.

## Who is affected

- **Apps that read `extra` from a 5xx response in production.** There is none now; read the log, or put what the client needs in the message or a 4xx.
- **Apps that read `extra` from a 4xx.** Values under secret-shaped keys (`password`, `token`, `apiKey`, `dsn`, ...) read `[REDACTED]`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/base/middlewares/app-error/app-error.middleware.ts` | kernel |
