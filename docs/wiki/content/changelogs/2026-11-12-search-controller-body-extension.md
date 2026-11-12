---
title: A search controller can take extra validated body keys for its scope
description: "SearchControllerFactory.build accepts request.body.extend, a Zod shape added to every mode of the search body, and hands the validated, typed body to scope as input."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-12

## A search controller can take extra validated body keys for its scope

<Badge type="tip" text="New Feature" />

**In one line.** A facet the search body does not have no longer forces a hand-written route: `request.body.extend` adds it, validated and typed, and your `scope` reads it.

## What changed

- **`request.body.extend`.** A Zod shape added to each `mode` of the `POST /search` body. A bad value is a `400`, and the OpenAPI document shows the keys. A key the base body already has is refused when the controller is built.
- **`scope` gets `input`.** The resolver is called with `{ context, input }`, where `input` is the validated body typed from your shape (`input.ids` is a `string[]`). A resolver that reads only `context` keeps working.
- **No change without it.** Leave `request` out and the body, the scope and the OpenAPI document are what they were.

## Who is affected

- **Apps that scope a search by a key the body lacks.** Add `request.body.extend` and read it in `scope`. See [Extra body keys for the scope](/guides/core-concepts/persistent/search-typesense#extra-body-keys-for-the-scope).
- **Everyone else.** No action needed.
