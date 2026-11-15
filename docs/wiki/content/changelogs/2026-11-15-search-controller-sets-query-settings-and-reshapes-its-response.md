---
title: A search controller sets query settings on the server and reshapes its response
description: "SearchControllerFactory.build takes query (fixed, default, allow.tuning), typed against the model and the engine, and response, which reshapes the hits."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-11-15

## A search controller sets query settings on the server and reshapes its response

<Badge type="tip" text="New Feature" />

**In one line.** A search route can fix or default `queryBy`, its weights, the order and the engine's tuning, and can reshape the hits it returns, with every name checked against your model.

## What changed

- **`query.fixed` and `query.default`.** `fixed` wins over the client (a client value for a fixed setting is a `400`). `default` fills in what the client left out and sits above the model's `defaultQueryBy`. Each is a value, or a function `({ context, input }) => settings` of the validated, scoped body.
- **Typed settings.** `queryBy`, `queryByWeights` (keyed by field name, not a positional list), `order` and `tuning` are camelCase and typed against the model. `tuning` is typed by the engine through the repository's datasource: write `DefaultSearchRepository<TArticle, TypesenseDataSource>`. A list knob such as `numTypos` is a record keyed by field name.
- **Checked when the controller is built.** A field the model does not have, a hidden field, a `queryBy` field that is not text, and a weight for a field outside `queryBy` throw. A function source is checked on every request and answers `500`, because the value is the server's.
- **`response`.** `{ use: true, document, transform }` reshapes the hits of `POST /search`. The transform may drop hits, `document` is the OpenAPI schema and is checked against every transformed document (`500` on a mismatch), and the list headers keep the engine's page.
- **`TToggle` and `ToggleUtility` are in the kernel.** Components and controllers share one toggle shape.

## Who is affected

- **Apps that want a search route with server-chosen settings or a trimmed response.** See [Settings the server chooses](/guides/core-concepts/persistent/search-typesense#settings-the-server-chooses) and [Reshape the response](/guides/core-concepts/persistent/search-typesense#reshape-the-response).
- **Everyone else.** No action needed: a controller built without `query` and `response` behaves as before.

## Related breaking changes

This release also changes the shape of `SearchControllerFactory.build` options: see the entries on [`query.allow.tuning`](/changelogs/2026-11-15-search-allowed-tuning-moves-to-query-allow), [route toggles](/changelogs/2026-11-15-search-routes-are-toggles), [the raw mode toggle](/changelogs/2026-11-15-search-raw-mode-is-a-toggle) and [required `authenticate`](/changelogs/2026-11-15-search-controller-must-say-how-it-authenticates).
