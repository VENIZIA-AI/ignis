---
title: A Repository Can Inject a Datasource Registered by Hand
description: "@inject({ target }) at a repository's parameter 0 now accepts a datasource class that has no binding key yet, and still refuses anything that is not a datasource."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-24

## `@inject({ target })` accepts a datasource registered by hand

<Badge type="info" text="Bug Fix" />

**In one line.** A repository can inject a datasource you register with `this.dataSource(...)`, without `@datasource()` on it.

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

## What changed

- **Before,** the import threw `Found @inject with key: 'undefined' | Expected key starting with 'datasources.'`.
- **Now** a `target` with no key yet is checked by its class: a datasource class passes, and any other class is refused.
- `{ key }` starting with `datasources.`, and a `{ target }` whose recorded key starts with `datasources.`, are accepted as before.

## Who is affected

- **A repository that names a datasource registered by hand.** The old workaround, `@datasource()` on the datasource or no explicit `@inject`, keeps working.
