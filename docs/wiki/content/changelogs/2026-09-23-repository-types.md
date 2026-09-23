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
- **`getRepositoryMetadata()`** now returns the `TRepositoryMetadata` union, so its `.model` is typed `... | undefined`. Code that passes `.model` on stops compiling. Check `model` or narrow on `type` first.

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
- **An empty `repository.name` throws** when the controller is defined. Before, the name was never read.
- **Fixed on the way:** a subclass's `@inject` no longer rewrites the injection list its parent class owns, so two subclasses of one generated controller can inject differently.
- **Bump every `@venizia/*` package of this release together.** BANA pins each package separately, so a partial bump is possible.
  - On inversion 0.2.0-23, `setInjectMetadata` writes into the injection list a subclass inherits, so the subclass rewrites its parent's. Two subclasses of one generated CRUD or search controller keep separate injections only on the new inversion. A `@repository` subclass that names its own `dataSource` is safe on both: the kernel copies the list before it writes.
  - **A partial bump fails loud.** An old kernel next to the new connectors, `@venizia/ignis` or worker throws `errorResponses is not a function` at boot, rejects `stop()` inside its `finally`, or fails to link the connectors' search controllers.
  - **A partial bump fails silent.** A new kernel next to old connectors stops reporting the audit keys, so the CRUD routes no longer omit them - writable again, as before this release.

## `HttpDataSource` accepts a relative `baseUrl`

<Badge type="tip" text="Feature" />

`new HttpDataSource({ baseUrl: '/api' })` threw `Invalid URL` on the first request. A relative `baseUrl` now resolves against `location.href`, so a page or a Web Worker can call its own origin or a dev-server proxy.

A server has no `location`. There, a relative `baseUrl` fails naming the `baseUrl` and the fix - pass an absolute URL. An absolute `baseUrl` is unchanged.

## `RequestSpyMiddleware` no longer drains upload bodies

<Badge type="info" text="Bug Fix" />

**In one line.** A handler that streams `req.raw.body` on - an upload proxy - failed with `Body object should not be disturbed or locked`, in every environment.

The spy read every body that was not JSON or a form with `req.text()`, even where it would not log it. That drained the stream, and a handler that read the bytes anyway got them UTF-8 mangled - an xlsx, an image or a PDF was lost.

| `Content-Type` | Before | Now |
|---|---|---|
| `application/json`, form types | Parsed | Parsed - a malformed body is still a 400 |
| `text/*` | `req.text()` | Read from a clone, or from Hono's cache when a middleware already read it |
| Anything else except `application/octet-stream` | `req.text()` | Not read; logged as `<N bytes, content-type>` |

- **Who is affected:** any route behind `RequestTrackerComponent` that receives a binary body with its real content type. Nothing to change on your side.
- **`parseBody` callers:** a binary type now returns the `<N bytes, content-type>` description instead of mangled text.
