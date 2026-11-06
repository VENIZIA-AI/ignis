---
title: The validation response carries no raw error in production
description: "A 422 validation response in production lists the validation issues; when the message is not an issue list it carries no cause, instead of the raw error object."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The validation response carries no raw error in production

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** When a Zod error's message was not a parsable list of issues, the production 422 response put the raw error object in `details.cause`. It now carries no cause.

## What changed

- **Issues only.** In production `details.cause` is the list of issues (`path`, `message`, `code`, `expected`, `received`). If the message is not a list, `details.cause` is absent.
- **Outside production** the raw error stays in `details.cause` for debugging.

## Who is affected

- **Clients that read `details.cause` of a 422 in production.** The issue list is unchanged.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/base/middlewares/app-error/zod.handler.ts` | kernel |
