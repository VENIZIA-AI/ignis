---
title: Two Repository Types, and CRUD Controllers Without a Constructor
description: "@repository takes type: RepositoryTypes.REMOTE for data behind another service's API, defineCrudController injects the repository it names, and HttpDataSource accepts a relative baseUrl in a browser."
---

# Changelog - 2026-09-23

## `@repository({ type })`

<Badge type="tip" text="Feature" />

**In one line.** A repository over another service's API has no model, and `@repository` no longer demands one.

```typescript
import { HttpRepository } from '@venizia/ignis-connectors/http';
import { repository, RepositoryTypes } from '@venizia/ignis';

@repository({ type: RepositoryTypes.REMOTE, dataSource: CatalogDataSource })
export class ProductRepository extends HttpRepository<TProduct> {
  constructor(dataSource: CatalogDataSource) {
    super({ dataSource, resource: 'products' });
  }
}
```

| `type` | `model` | Registers |
|---|---|---|
| `RepositoryTypes.MODEL` (default) | Required | Model binding + datasource injection |
| `RepositoryTypes.REMOTE` | Refused | Datasource injection only |

Before, a repository without `model` failed at decoration with `Missing 'model'`, so it lost the datasource injection too. Now `RepositoryTypes.REMOTE` keeps the injection and skips the model binding.

- **Who is affected:** no existing repository. Omitting `type` means `RepositoryTypes.MODEL`, so every `@repository({ model, dataSource })` behaves as before.
- **Type safety:** TypeScript rejects a `MODEL` repository without `model` and a `REMOTE` one with it. A JavaScript caller gets the same answer at decoration time, as does an unknown `type`.
- **Inheritance:** a bare `@repository()` on a subclass inherits the parent's `type` with its model and datasource.

See [Read another service's API](/references/base/repositories/#read-another-service-s-api).

## `defineCrudController` injects its repository

<Badge type="tip" text="Feature" />

**In one line.** The generated controller injects the repository named in `repository.name`, so the subclass needs no constructor.

**Before:**

```typescript
@controller({ path: BASE_PATH })
export class NoteController extends BaseCrudController {
  constructor(
    @inject({
      key: BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: NoteRepository.name }),
    })
    repository: NoteRepository,
  ) {
    super(repository);
  }
}
```

**After:**

```typescript
@controller({ path: BASE_PATH })
export class NoteController extends BaseCrudController {}
```

- **Who is affected:** a `defineCrudController` subclass with no decorated constructor parameter now receives `repositories.<repository.name>` at parameter 0. That name must match a bound repository, or resolving the controller fails.
- **Who is not:** a subclass with an explicit `@inject` constructor. Its own injection at parameter 0 still wins.
- **Fixed on the way:** a subclass's `@inject` no longer rewrites the injection list its parent class owns, so two subclasses of one generated controller can inject differently.

## `HttpDataSource` accepts a relative `baseUrl`

<Badge type="tip" text="Feature" />

`new HttpDataSource({ baseUrl: '/api' })` threw `Invalid URL` on the first request. A relative `baseUrl` now resolves against `location.href`, so a page or a Web Worker can call its own origin or a dev-server proxy.

A server has no `location`. There, a relative `baseUrl` fails naming the `baseUrl` and the fix - pass an absolute URL. An absolute `baseUrl` is unchanged.
