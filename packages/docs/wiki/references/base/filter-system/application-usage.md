# Using Filters in Your Application

How filters flow through the application layers.


## Architecture Overview

```
+-----------------------------------------------------------------+
|                        HTTP Request                              |
|   GET /products?filter={"where":{"status":"active"},"limit":10} |
+--------------------------------+--------------------------------+
                                 |
                                 v
+-----------------------------------------------------------------+
|                     Controller Layer                             |
|   - Validates filter via Zod schema                              |
|   - Parses JSON string -> Filter object                          |
|   - Passes to service/repository                                 |
+-----------------------------------------------------------------+
                                 |
                                 v
+-----------------------------------------------------------------+
|                     Service Layer (Optional)                     |
|   - Business logic, authorization                                |
|   - May modify filter before passing                             |
+-----------------------------------------------------------------+
                                 |
                                 v
+-----------------------------------------------------------------+
|                     Repository Layer                             |
|   - FilterBuilder transforms Filter -> SQL                       |
|   - Executes query via Drizzle ORM                               |
|   - Returns typed results                                        |
+-----------------------------------------------------------------+
```


## Controller Layer

### Using ControllerFactory (Recommended)

The `ControllerFactory` automatically handles filter parsing and validation:

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
    isStrict: true,
    defaultLimit: 20,
  },
  entity: () => Product,
});

@controller({ path: BASE_PATH })
export class ProductController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    repository: ProductRepository,
  ) {
    super(repository);
  }
}
```

**Generated Endpoints:**

| Method | Endpoint | Filter Location |
|--------|----------|-----------------|
| GET | `/products` | Query param: `?filter={...}` |
| GET | `/products/:id` | Query param: `?filter={...}` (for includes) |
| GET | `/products/one` | Query param: `?filter={...}` |
| GET | `/products/count` | Query param: `?where={...}` |

### Custom Controller with Manual Filter Handling

```typescript
@controller({ path: '/products' })
export class ProductController extends BaseController {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepo: ProductRepository,
  ) {
    super({ scope: 'ProductController', path: '/products' });
  }

  override binding() {
    this.defineRoute({
      configs: {
        path: '/search',
        method: 'get',
        query: {
          filter: FilterSchema,
        },
      },
      handler: async (context) => {
        const { filter = {} } = context.req.valid('query');
        const results = await this._productRepo.find({ filter });
        return context.json(results);
      },
    });
  }
}
```


## Service Layer

Services can modify filters before passing to repositories:

```typescript
@service()
export class ProductService {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepo: ProductRepository,
  ) {}

  async findProducts(filter: TFilter<TProductSchema> = {}) {
    // Merge user filter with soft-delete condition
    const enhancedFilter: TFilter<TProductSchema> = {
      ...filter,
      where: {
        ...filter.where,
        deletedAt: { is: null },
      },
    };

    return this._productRepo.find({ filter: enhancedFilter });
  }

  async findProductsForTenant(
    tenantId: string,
    filter: TFilter<TProductSchema> = {},
  ) {
    const isolatedFilter: TFilter<TProductSchema> = {
      ...filter,
      where: {
        ...filter.where,
        tenantId,
      },
    };

    return this._productRepo.find({ filter: isolatedFilter });
  }
}
```


## HTTP Request Examples

**cURL:**
```bash
# Simple filter
curl "http://localhost:3000/products?filter=%7B%22where%22%3A%7B%22status%22%3A%22active%22%7D%2C%22limit%22%3A10%7D"

# Decoded filter: {"where":{"status":"active"},"limit":10}

# Complex filter with URL encoding
curl -G "http://localhost:3000/products" \
  --data-urlencode 'filter={"where":{"price":{"gte":100,"lte":500},"tags":{"contains":["featured"]}},"order":["price ASC"],"limit":20}'
```

**JavaScript/TypeScript:**
```typescript
// Using fetch
const filter = {
  where: { status: 'active', price: { lte: 100 } },
  order: ['createdAt DESC'],
  limit: 10,
};

const response = await fetch(
  `/api/products?filter=${encodeURIComponent(JSON.stringify(filter))}`
);

// Using axios
const response = await axios.get('/api/products', {
  params: { filter: JSON.stringify(filter) },
});
```


## Debugging Filters

```typescript
// Enable logging to see generated SQL
const result = await repo.find({
  filter: complexFilter,
  options: {
    log: { use: true, level: 'debug' },
  },
});

// Or use buildQuery to inspect without executing
const queryOptions = repo.buildQuery({ filter: complexFilter });
console.log('Generated query options:', queryOptions);
```
