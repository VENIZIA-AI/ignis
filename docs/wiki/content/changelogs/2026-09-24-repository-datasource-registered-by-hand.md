---
title: A Repository Can Inject a Datasource Registered by Hand
description: "@inject({ target }) at a repository's parameter 0 accepts a datasource class that has no binding key yet, and still refuses anything that is not a datasource."
---

# Changelog - 2026-09-24

## `@inject({ target })` accepts a datasource registered by hand

<Badge type="info" text="Bug Fix" />

**In one line.** Parameter 0 of a repository is always a datasource, and that check no longer depends on when the datasource is registered.

```typescript
@repository({ type: RepositoryTypes.REMOTE, dataSource: CatalogDataSource })
export class ProductRepository extends HttpRepository<TProduct> {
  constructor(@inject({ target: CatalogDataSource }) dataSource: CatalogDataSource) {
    super({ dataSource, resource: 'products' });
  }
}

// in the application - no @datasource() on CatalogDataSource
this.dataSource(CatalogDataSource);
```

Before, the import threw `Found @inject with key: 'undefined' | Expected key starting with 'datasources.'`. `@repository` looked for the binding key recorded on `CatalogDataSource`, and `this.dataSource()` records that key only later, when the application configures. Now a `target` with no key yet is checked by its class: a datasource class passes, anything else is refused.

| `@inject` at parameter 0 | Result |
|---|---|
| `{ key }` starting with `datasources.` | Accepted, unchanged |
| `{ target }` whose recorded key starts with `datasources.` | Accepted, unchanged |
| `{ target }` of a datasource class with no key yet | **Accepted** (refused before) |
| `{ target }` of any class that is not a datasource | Refused, unchanged |

- **Who is affected:** a repository that names a datasource registered by hand. The workaround, `@datasource()` on the datasource or no explicit `@inject`, keeps working.
