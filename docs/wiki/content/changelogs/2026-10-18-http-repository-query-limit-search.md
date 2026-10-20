---
title: HttpRepository Takes an Extra Query, a Default Limit and Searches
description: "HttpRepository reads take a query beside filter and where, a defaultLimit setting bounds every find, and search() calls the IGNIS search route."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-18

## HttpRepository takes an extra query, a default limit and searches

<Badge type="tip" text="Enhancement" />

**In one line.** An `HttpRepository` read can carry query parameters beside `filter` and `where`, a `defaultLimit` setting keeps a list from being unbounded, and `search()` calls the search route an IGNIS server generates.

## What changed

- **`query` on the read methods.** `find`, `findOne`, `findById`, `count` and `existsWith` take `query: { merchantId: 'm1', q: 'abc' }` and send it next to the filter. The filter and `where` win over a key of the same name.
- **`buildQuery` hook.** Every read builds its query string in one protected method, `buildQuery({ method, query, params })`. A subclass overrides it to reshape one verb - a keyword into the object its server reads - and leaves the others alone.
- **`defaultLimit` setting.** `new HttpRepository({ dataSource, resource, defaultLimit: 50 })` makes `find` ask for 50 rows when its filter names no `limit`. A filter's own limit wins. `findOne`, `count` and `existsWith` keep their own limit of 1. A value that is not a positive integer throws at construction.
- **`search({ input, query?, options? })`.** It POSTs `input` to `<resource>/search`, the route `SearchControllerFactory.defineSearchController` generates, and returns the server's `{ found, isFoundExact, hits }`. `found` is the total; `isFoundExact` is `false` when the engine estimates it. A body that is not that envelope throws instead of reading as no match.
- **`searchPath` setting and `getSearchPaths` hook.** `searchPath` renames the segment after the resource; a subclass overrides `getSearchPaths()` to move the whole route.

## Who is affected

- **Existing callers.** No action needed: every new argument and setting is optional.
- **A server with its own search routes.** IGNIS generates `POST <resource>/search` and `POST <resource>/multi-search`, and no `search/count` route - the total of a search is `found`. A route of any other shape stays a call to `dataSource.read`.

**Files:** [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/connectors/src/http/repository.ts)
