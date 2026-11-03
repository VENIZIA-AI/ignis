---
title: An Application Refuses to Start When scopeFilter Cannot Take Effect
description: An application now fails at startup, naming the model, when settings.scopeFilter is declared on a search-backed model or while asyncContext.enable is false.
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-08-31

## scopeFilter boot checks

<Badge type="tip" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Declaring `settings.scopeFilter` where it cannot be honoured now stops the application at boot, naming the model, instead of failing silently on every query.

## What changed

- **Search-backed model.** Search repositories never read `settings.scopeFilter`, so no scope was applied and queries returned more rows than intended. Boot now fails and tells you to scope the search query in the application and remove the setting.
- **`asyncContext.enable` is `false`.** `scopeFilter.resolve()` has no request context, `onMissing` denies, and every query on the model matched zero rows. Boot now fails and tells you to set `asyncContext.enable` to `true` or remove `settings.scopeFilter`.
- **Order.** When both apply, the search case is reported first.
- **Timing.** The check runs once at the end of application startup, after components have contributed their models.
- **`assertScopeFilterSupported`** is exported from `@venizia/ignis-connectors` for a custom host:

```typescript
import { assertScopeFilterSupported } from '@venizia/ignis-connectors';

assertScopeFilterSupported({ asyncContextEnabled: true });
```

## Who is affected

- **Applications that already work.** No change. `asyncContext.enable` defaults to `true` for a server application.
- **Anyone who set `asyncContext: { enable: false }` and also declares `scopeFilter`.** That combination never worked; it now says so at boot.
- **Anyone who put `scopeFilter` on a search-backed model.** It never applied; it now fails at boot.

## Details

- This does not make `scopeFilter` work on search. Scoping a search query is still the application's job.
