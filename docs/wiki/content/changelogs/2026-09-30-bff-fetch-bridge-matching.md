---
title: installBffFetch Matches Whole Path Segments, and Can Be Limited to Named Origins
description: "The BFF fetch bridge no longer claims /apix for a basePath of /api, and a new origin option keeps calls to other origins on the network."
---

# Changelog - 2026-09-30

## `installBffFetch` claims only what it should

<Badge type="info" text="Bug Fix" />

**In one line.** `basePath: '/api'` now claims `/api` and `/api/...` only, and the new `origin` option lets the bridge ignore requests to origins the BFF does not stand in for.

## What changed

- **Segment boundary.** Before, the bridge tested `pathname.startsWith('/api')`, so `/apix`, `/api-docs` and `/apiv2/...` were answered by the BFF and never reached the network. Now a prefix matches only the exact path or a path under it. A trailing slash on the prefix is ignored.
- **`origin` (new, optional).** One origin or a list. When set, a request to any other origin goes to the network whatever its path:

  ```ts
  installBffFetch({ transport: bff, basePath: '/v1/api', origin: new URL(BASE_URL).origin });
  ```

  Unset, only the path decides - the behaviour so far - so an app whose client calls an upstream gateway by absolute URL keeps working unchanged.

## Who is affected

- **An app that relied on a prefix inside a segment** (`/api` meant to claim `/apiv2`). List each prefix instead: `basePath: ['/api', '/apiv2']`.
- **An app that passed `basePath: '/'`.** It is now refused like an empty prefix; list the real prefixes.
- **An app whose page also calls an external API with the same path prefix.** Set `origin` so those calls stay on the network.
- **Everyone else.** No action needed.
