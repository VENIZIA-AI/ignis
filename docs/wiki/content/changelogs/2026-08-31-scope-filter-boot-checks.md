---
title: An Application Refuses to Start When scopeFilter Cannot Take Effect
description: Two boot checks turn the two silent failure modes of settings.scopeFilter - a search-backed model returning more rows, a context-less one returning none - into a startup error that names the model.
---

# Changelog - 2026-08-31

## scopeFilter boot checks

<Badge type="tip" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Declaring `settings.scopeFilter` where it cannot be honoured now stops the application at boot, naming the model, instead of failing silently on every query.

## The two ways it was silent

`scopeFilter` is honoured by relational repositories, reading the ambient request context. Two configurations break that, and until now both were quiet:

| Configuration | What actually happened | Which direction it fails |
|---|---|---|
| The model is search-backed | The setting is never read; no scope is applied | **More rows** than intended |
| `asyncContext.enable` is `false` | `resolve()` sees no context, `onMissing` denies | **Zero rows**, on every query |

Neither threw. Neither logged. The first is the more dangerous of the two: on the relational path a missing scope **denies**, so a mistake shows up as an empty list somebody investigates - on the search path the same mistake shows up as a **wider** result, which looks like it worked.

The second is quieter than it sounds. Every query on the model matches nothing, and no error anywhere names `asyncContext.enable` as the cause - so the search for the bug starts in the resolver, which is correct.

## What happens now

Both are checked once, at the end of application startup, after components have contributed their models:

```
[assertScopeFilterSupported] settings.scopeFilter on a search-backed model | models: ProductDocument
| Search repositories never read this setting, so no row scope is applied.
| Unlike the relational path, a missing scope here returns MORE rows rather than none - nothing
  fails, the result is just wider.
| Scope the search query in the application, and remove settings.scopeFilter from the model.
```

```
[assertScopeFilterSupported] settings.scopeFilter declared while asyncContext.enable is false
| models: Order, Invoice
| scopeFilter.resolve() takes no arguments, so the ambient request context is its only input.
| With no context store every resolve() returns undefined, onMissing denies by default, and EVERY
  query on these models matches zero rows - with nothing naming the flag as the cause.
| Set asyncContext.enable to true, or remove settings.scopeFilter.
```

The search case is reported first when both apply: it needs a code change, while the other may be one line of config.

## Who is affected

- **Applications that already work.** Nothing changes. `asyncContext.enable` defaults to **`true`** for any server application, so a model with `scopeFilter` on a relational repository was already in the supported configuration.
- **Anyone who set `asyncContext: { enable: false }` explicitly** and also declares `scopeFilter`. That combination never worked - every query on those models returned nothing - and now says so at boot.
- **Anyone who put `scopeFilter` on a search-backed model** expecting it to apply. It never did.

## Booting outside the standard application

The check is a plain function, so a custom host can call it directly:

```typescript
import { assertScopeFilterSupported } from '@venizia/ignis-connectors';

assertScopeFilterSupported({ asyncContextEnabled: true });
```

It lives in `connectors` rather than the server layer because that is the package that both **applies** `scopeFilter` (relational) and **ignores** it (search). The caller passes `asyncContextEnabled`, so no application config type reaches into the connector tier.

## Details

- The scan reads `MetadataRegistry.getAllModels()`, so a model contributed by a component is covered - the call sits after `postConfigure()` for exactly that reason.
- A model is treated as search-backed by its class, not its datasource: `BaseSearchEntity` in the prototype chain. A model with no `scopeFilter` is skipped before any of this.
- This does not make `scopeFilter` work on search. It makes the gap loud. Scoping a search query is still the application's job - see the row-scope changelog for why that boundary is where it is.

| File | Package |
|------|---------|
| `src/common/scope-filter.ts` | connectors |
| `src/base/applications/base.ts` | core-server |
