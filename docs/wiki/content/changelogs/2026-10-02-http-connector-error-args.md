---
title: HTTP Connector Errors Keep the Server Message Args
description: "A failed read or write through connectors/http now carries the server's normalized.args, so a translated error message can fill its placeholders."
---

# Changelog - 2026-10-02

## Server message args survive the HTTP hop

<Badge type="info" text="Bug Fix" />

**In one line.** A failed read or write through `@venizia/ignis-connectors/http` now throws with the server's `normalized.args`, not just its `normalized.code`.

## What changed

The IGNIS error envelope carries `normalized: { text, code, args }`. In 0.2.1-1 the connector read the code and dropped the args, so the thrown `ApplicationError` always had `normalized.args = {}`. A UI that renders the error by its code - `A category named %{name} already exists.` - then showed the placeholder unfilled.

Now the args come through when they are a plain object; anything else is left out.

## Who is affected

- **A UI that translates connector errors by `normalized.code`.** Placeholders now fill.
- **Everyone else.** No change.

**Files:** [`packages/connectors/src/http/datasource.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/datasource.ts)
