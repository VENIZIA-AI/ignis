---
title: Using Filters in Your Application
description: How filters flow through application layers
difficulty: intermediate
---

# Using Filters in Your Application

A `filter` starts as a JSON-encoded query string on an HTTP request and ends as a Drizzle query. Here is where to hook into each layer in between.

```
HTTP Request         GET /products?filter={"where":{"status":"active"},"limit":10}
      |
      v
Controller Layer      Validates via Zod (FilterSchema), parses JSON string -> Filter object
      |
      v
Service Layer          Optional - business logic, authorization, may edit the filter
      |
      v
Repository Layer       applyDefaultFilter() merges the @model default filter,
                        FilterBuilder converts Filter -> Drizzle query options, executes
```

## Generate a CRUD controller from an entity

For a standard `GET`/`POST`/`PATCH`/`DELETE` resource, generate the controller instead of writing filter parsing by hand. `ControllerFactory.defineCrudController` builds it from an entity and a repository binding:

```typescript
// src/controllers/product.controller.ts
import { Product } from '@/models';
import { ProductRepository } from '@/repositories';
import {
  controller,
  ControllerFactory,
  inject,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';

const BASE_PATH = '/products';

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ProductRepository.name },
  controller: {
    name: 'ProductController',
    basePath: BASE_PATH,
    isStrict: { path: true, requestSchema: true },
  },
  entity: () => Product,
});

@controller({ path: BASE_PATH })
export class ProductController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: ProductRepository.name }),
    })
    repository: ProductRepository,
  ) {
    super(repository);
  }
}
```

This generates every filter-bearing endpoint the resource needs:

| Method | Endpoint | Query param |
|---|---|---|
| GET | `/products` | `filter` |
| GET | `/products/{id}` | `filter` (`where` is ignored - the id is the condition) |
| GET | `/products/find-one` | `filter` |
| GET | `/products/count` | `where` |

Set `isStrict.requestSchema: true` to make these query params Zod-required; set `isStrict.path: true` to reject trailing-slash variants of the route. Write endpoints (`POST /`, `PATCH /{id}`, `DELETE /{id}`, ...) come from the same factory call and take no filter.

## Map a request query string to a parsed filter

`FilterSchema` and `WhereSchema` both accept a JSON string or a plain object, so the same schema validates a Hono query param (always a string) and a filter built in code:

| Request | Parsed filter |
|---|---|
| `GET /products?filter={"where":{"status":"active"}}` | `{ where: { status: 'active' } }` |
| `GET /products?filter={"limit":10,"skip":20}` | `{ limit: 10, skip: 20 }` |
| `GET /products?filter={"where":{"price":{"gte":100,"lte":500}},"order":["price ASC"]}` | `{ where: { price: { gte: 100, lte: 500 } }, order: ['price ASC'] }` |
| `GET /products/count?where={"role":"admin"}` | `{ role: 'admin' }` |

`WhereSchema` is independent of `FilterSchema` - it backs the `count` endpoint, which takes `where` directly rather than a full filter.

## Write a custom route that accepts a filter

For a route outside the generated CRUD set, accept `FilterSchema` directly on the query:

```typescript
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, FilterSchema, inject, jsonResponse } from '@venizia/ignis';

@controller({ path: '/products' })
export class ProductController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepository: ProductRepository,
  ) {
    super({ scope: 'ProductController', path: '/products' });
  }

  override binding() {
    this.defineRoute({
      configs: {
        path: '/search',
        method: 'get',
        request: { query: z.object({ filter: FilterSchema }) },
        responses: jsonResponse({ schema: z.array(z.object({ id: z.string() })) }),
      },
      handler: async context => {
        const { filter = {} } = context.req.valid('query');
        const results = await this._productRepository.find({ filter });
        return context.json(results);
      },
    });
  }
}
```

## Rewrite a filter before it reaches the repository

Add a service between the controller and the repository when a constraint is a caller or session concern rather than a per-model constant - a tenant ID pulled from the request context, for example. Use [Default Filter](./default-filter) instead when the constraint applies to every caller of the model:

```typescript
@service()
export class ProductService {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepository: ProductRepository,
  ) {}

  async findProductsForTenant(tenantId: string, filter: TFilter<TProductSchema> = {}) {
    return this._productRepository.find({
      filter: { ...filter, where: { ...filter.where, tenantId } },
    });
  }
}
```

## Build a filter query string from a client

Encode the filter as JSON and pass it as the `filter` query param, whichever HTTP client you use:

**cURL:**
```bash
curl -G "http://localhost:3000/products" \
  --data-urlencode 'filter={"where":{"price":{"gte":100,"lte":500},"tags":{"contains":["featured"]}},"order":["price ASC"],"limit":20}'
```

**Fetch/Axios:**
```typescript
const filter = { where: { status: 'active', price: { lte: 100 } }, order: ['createdAt DESC'], limit: 10 };

// fetch
const response = await fetch(`/api/products?filter=${encodeURIComponent(JSON.stringify(filter))}`);

// axios
const response = await axios.get('/api/products', { params: { filter: JSON.stringify(filter) } });
```

## Debug what a filter compiles to

Call `buildQuery` to compile a filter into Drizzle query options without executing it - the fastest way to check what a filter actually resolves to:

```typescript
const queryOptions = repository.buildQuery({ filter: complexFilter });
console.log('Generated query options:', queryOptions);
```

`options.log` also traces repository calls, but only on the write path (`create`/`updateById`/`updateAll`/`deleteById`/`deleteAll`) - `find`/`findOne`/`findById`/`count` never read it. See [Advanced Repository Features -> Log option](../repositories/advanced.md#log-option) for the write-side form.

## See also

- [Filter System Overview](./) - the `filter` shape and every `where` operator family
- [Default Filter](./default-filter) - `shouldSkipDefaultFilter`, and the model-level alternative to the service-layer rewrite above
- [Use Case Gallery](./use-cases) - more filter shapes with their generated SQL
- [Advanced Repository Features](../repositories/advanced.md) - transactions, locking, and the full `log`/`lock` options

**Files:**

- [`packages/core/src/base/controllers/factory/controller.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/controllers/factory/controller.ts) - `ControllerFactory.defineCrudController`
- [`packages/core/src/base/repositories/query-schemas/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/query-schemas/filter.ts) - `FilterSchema`, `TFilter`, `TInclusion`
- [`packages/core/src/connectors/postgres/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/base.ts) - `RelationalBaseRepository.buildQuery`
