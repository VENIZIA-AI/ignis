---
title: The boot probe validates configs.middlewares and does not run setupMiddlewares
description: "ApplicationBootAssertion.assert fails on an invalid configs.middlewares value, such as a bad CORS pattern, because the default stack is a boot step. It does not run your setupMiddlewares(); the docs now say so."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-06

## The boot probe validates configs.middlewares and does not run setupMiddlewares

<Badge type="info" text="Enhancement" />

**In one line.** `ApplicationBootAssertion.assert` already fails on an invalid `configs.middlewares` value, such as a CORS wildcard that cannot be parsed. It does not run `setupMiddlewares()`, and the testing guide now says so.

## What changed

- **Documented, not changed.** The probe runs `init()` and `initialize()`. The framework's middleware stack (CORS, body limit, request id) is a boot step of `initialize()`, so a bad `configs.middlewares.cors` or `bodyLimit` fails the probe with the error a real boot raises. Two tests pin this.
- **`setupMiddlewares()` stays out.** It is the application's own start-time step. It is user code that can open connections, so the probe cannot assume it is free of side effects. Call it yourself in the test when yours is cheap and offline.

## Who is affected

- **Apps that wondered whether the boot test covers their CORS and body-limit configuration.** It does.
- **Apps that wire middleware in `setupMiddlewares()`.** The boot test does not run that method.

## Details

| File | Package |
|------|---------|
| `src/testing/assert-application-boots.ts` | core-server |
