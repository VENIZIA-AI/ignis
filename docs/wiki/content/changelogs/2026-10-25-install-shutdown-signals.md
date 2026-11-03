---
title: installShutdownSignals Stops the Application on SIGTERM and SIGINT
description: "ServerApplication.installShutdownSignals is an opt-in hook that stops the application and exits when the process receives SIGTERM or SIGINT."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-25

## installShutdownSignals stops the application on SIGTERM and SIGINT

<Badge type="tip" text="New Feature" />

**In one line.** `application.installShutdownSignals()` replaces the signal handlers every app wrote by hand: it stops the application and exits when the process is told to end.

```typescript
await application.start();
application.installShutdownSignals();
```

## What changed

- **A new opt-in method on `ServerApplication`.** `installShutdownSignals({ signals?, timeoutMs?, exit? })` listens for `SIGTERM` and `SIGINT` (or the signals you pass) and calls `stop()`.
- **It calls `stop()` once.** A second signal while it runs is ignored.
- **It always ends the process.** Exit code `0` when `stop()` finishes, `1` when it throws or does not finish within `timeoutMs` (default `15_000`).
- **It is idempotent and reversible.** Calling it again returns the same uninstall function and adds no listener; the uninstall function removes the listeners and cancels the pending timeout.
- **Core-server only.** The kernel gets no process signal handlers.

## Who is affected

- **Apps with hand-written `SIGTERM` and `SIGINT` handlers.** You can replace them. If you keep yours, do not also call this method: both would try to stop the application.
- **Everyone else.** No action needed: nothing is installed unless you call it.
