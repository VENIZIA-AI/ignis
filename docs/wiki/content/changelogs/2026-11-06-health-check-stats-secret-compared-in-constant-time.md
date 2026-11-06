---
title: The health-check stats secret is compared in constant time
description: "GET /health/stats compares the configured secretKey with Hash.equals instead of ===."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-06

## The health-check stats secret is compared in constant time

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** The check of `stats.secretKey` on `GET /health/stats` took a time that depended on how much of the supplied value was right. It uses `Hash.equals` now.

## What changed

- **Constant-time compare.** The header value and the configured secret are compared with `Hash.equals`. A missing or non-string header is refused.
- **Nothing else changes.** An unset `secretKey` still leaves the route open, a blank one still refuses every request, and the header and status codes are the same.

## Who is affected

Nobody needs to act.

## Details

| File | Package |
|------|---------|
| `src/components/health-check/reporter.ts` | core-server |
