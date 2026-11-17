---
title: A search controller can take extra validated body keys for its scope
description: "SearchControllerFactory.build accepts request.body.extend, a Zod shape added to every mode of the search body, and hands the validated, typed body to scope as input."
packages: ['@venizia/ignis-connectors']
migration:
  - id: search-scope-resolver-input
    symbols: [TSearchScopeResolver]
    upgrade:
      before: |
        const resolver: TSearchScopeResolver = ({ context }) => ({ status: 'active' });

        // a test or a wrapper that calls the resolver itself
        resolver({ context });
      after: |
        const resolver: TSearchScopeResolver = ({ context }) => ({ status: 'active' });

        // the resolver is called with the validated body too
        resolver({ context, input });
    downgrade:
      steps:
        - "Call the resolver with { context } only; the older type has no input."
        - "Remove request.body.extend from SearchControllerFactory.build: the older build has no such option, and a scope that reads input.<key> must read the key from the request another way."
  - id: search-controller-type-arguments
    symbols: [SearchControllerFactory.build, AbstractSearchController]
    upgrade:
      steps:
        - "Nothing to change when you leave the type arguments of build() and AbstractSearchController to inference: the new last type parameter defaults to no extra keys."
        - "If you pass all type arguments by position, they still line up: the new parameter is the last one and has a default."
    downgrade:
      steps:
        - "Drop the extra type argument if you passed one; the older classes have one fewer."
---

# Changelog - 2026-11-12

## A search controller can take extra validated body keys for its scope

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A facet the search body does not have no longer forces a hand-written route: `request.body.extend` adds it, validated and typed, and your `scope` reads it.

## What changed

- **`request.body.extend`.** A Zod shape added to each `mode` of the `POST /search` body. A bad value is a `400`, and the OpenAPI document shows the keys. A key the base body already has is refused when the controller is built.
- **`scope` gets `input`.** The resolver is called with `{ context, input }`, where `input` is the validated body typed from your shape (`input.ids` is a `string[]`). A resolver that reads only `context` keeps working. Code that calls a `TSearchScopeResolver` itself (a unit test of a scope, say) must pass `input` too: that is the one breaking change, at the type level.
- **The extra keys stop at your scope.** They are not search fields, so they are dropped before the repository runs and are not logged. The mode descriptions stay in the OpenAPI document.
- **No change without it.** Leave `request` out and the body, the scope and the OpenAPI document are what they were.

## Who is affected

- **Apps that scope a search by a key the body lacks.** Add `request.body.extend` and read it in `scope`. See [Extra body keys for the scope](/guides/core-concepts/persistent/search-typesense#extra-body-keys-for-the-scope).
- **Code that calls a scope resolver itself.** Pass `input` beside `context`; the typecheck names each call.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `TSearchScopeResolver` takes `{ context, input }`. A resolver you write is unaffected; a call to one needs `input`.

**Before:**

```typescript
resolver({ context });
```

**After:**

```typescript
resolver({ context, input });
```
