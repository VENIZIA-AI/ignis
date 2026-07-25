---
title: Search and Mail Errors Join the Framework Catalog
description: Five client-facing codes from the search connectors and the mail component are now catalogued definitions instead of hand-typed at each throw. Codes and statuses are unchanged on the wire.
---

# Changelog - 2026-07-26

## Search and Mail Errors Join the Framework Catalog

<Badge type="tip" text="Enhancement" />

**In one line.** Nothing changes for a client - the same five codes with the same statuses - but the framework can no longer drift between two throw sites that mean the same failure.

## What changed

Two catalogs join the five that already existed:

| Catalog | Codes |
|---|---|
| `SearchErrors` | `core.search_engine.not_found`, `core.search_engine.already_exists` |
| `MailErrors` | `core.mail.template_not_found`, `core.mail.invalid_configuration`, `core.mail.invalid_recipient` |

Every code and status is byte-identical to before. If you branch on `error.normalized.code`, nothing to do.

## The problem it solves

These nine throw sites already carried a code. What they did not have was one place that tied the code to its status - each throw retyped both:

```typescript
// before - in the Typesense connector, and again in the Meilisearch one
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.Conflict,
  messageCode: SearchErrorCodes.ALREADY_EXISTS,
  message: `Document '${id}' already exists in collection '${collection}'.`,
});
```

`ALREADY_EXISTS` with `Conflict` was hand-typed in two connectors, `INVALID_CONFIGURATION` with `400` in three mail sites, and mail spelled its statuses as bare `400` / `404` rather than `HTTP.ResultCodes`. Nothing checked that the copies agreed. That is how one failure ends up with two codes.

```typescript
// after - status and code come from the definition, message stays human
throw getError({
  error: SearchErrors.ALREADY_EXISTS,
  message: `Document '${id}' already exists in collection '${collection}'.`,
});
```

All five codes are pinned in a test, so renaming one now fails the build here rather than a customer's frontend.

## What is deliberately not catalogued

Only **client-facing 4xx** get codes. An internal failure - a misconfiguration, a DI invariant, a programming error - stays codeless on purpose: it surfaces as a 500, and a code there is an identifier nobody can act on.

That distinction is worth stating because the raw numbers mislead. Of the `getError` sites in core that still spell their message inline, 197 declare no status at all and 38 declare a 5xx. None of those belong in a catalog. Exactly nine carried a 4xx, and this change closed them.

## Migration

None. `SearchErrorCodes` and `MailErrorCodes` remain exported - their other members serve the 5xx paths that stay codeless.
