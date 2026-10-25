---
title: Model Settings
description: One guide to every @model setting - hiddenProperties, query, access (row scope and write guard), limits and authorization - walked through a multi-merchant Product model
difficulty: intermediate
---

# Model Settings

`@model({ settings })` is where a model states how it is read, who may see its rows and who may write them. This guide walks one model, a multi-merchant `Product`, through every setting, and ends with a quick guide to pick the ones you need.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { productTable } from './product.table';

@model({
  settings: {
    hiddenProperties: ['costPrice'],
    query: {
      filter: { where: { isDeleted: false } },
      limit: { default: 20, max: 200 },
    },
    access: {
      resolve: () => {
        const merchantId = currentMerchantId();
        return merchantId ? { merchantId } : null;
      },
    },
    authorize: { principal: 'Product' },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

That one declaration hides the cost price from every result, hides soft-deleted rows, caps page sizes, limits every read and write to the caller's merchant, and names the model for authorization. Each part is below.

## 1. What model settings are

`settings` is an object on the `@model` decorator. It sits next to `type` and `tableName`, and the repository for the model reads it on every call. The running example uses this table:

```typescript
// src/models/product.table.ts
import { generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis/postgres';
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const productTable = pgTable('Product', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
  costPrice: integer('cost_price').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
});
```

The merchant of the current request comes from the authenticated user. This helper is used by the examples below; `RequestContextRegistry` reads the ambient request context, so turn on `asyncContext.enable` in the application config:

```typescript
// src/utilities/merchant.ts
import { Authentication, RequestContextRegistry } from '@venizia/ignis';

const currentUser = () => RequestContextRegistry.resolve()?.get(Authentication.CURRENT_USER);

export const currentMerchantId = (): string | undefined => {
  return currentUser()?.merchantId;
};

export const currentMerchantIds = (): string[] => {
  return currentUser()?.merchantIds ?? [];
};

export const isPlatformAdmin = (): boolean => {
  return currentUser()?.isPlatformAdmin === true;
};
```

The repository is the usual one:

```typescript
// src/repositories/product.repository.ts
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Product } from '@/models/product.model';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository extends DefaultCRUDRepository<typeof Product.schema> {}
```

| Setting | Default | What it does |
|---|---|---|
| `hiddenProperties` | none | Property names removed from every result, in SQL |
| `query.filter` | none | A filter merged into every query for the model, usually a soft-delete `where` |
| `query.limit.default` | `10` | Row limit for a query that names none |
| `query.limit.max` | `1000` | Largest `limit` a caller may ask for |
| `access.resolve` | required with `access` | Returns the row scope of the current caller, per query |
| `access.onMissing` | `'deny'` | What happens when `resolve()` returns `null` or `undefined` |
| `access.columns` | none | Names the columns the write guard checks; validated at boot |
| `access.write.mode` | `'reject'` | What a create or update does with a row outside the scope |
| `access.write.sharedRows` | `false` | Lets a restricted caller create, change and delete rows with no owner (`null` scope column) |
| `authorize.principal` | none | The authorization subject name of the model |

Settings are grouped by what they do. `query` shapes what a query returns. `access` decides who may read and write rows. `hiddenProperties` and `authorize` stand alone. The old flat names (`defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter`) were removed in 0.4.3, see [Migrating from the old keys](#migrating-from-the-old-keys).

## 2. hiddenProperties

`hiddenProperties` lists properties that must never leave the database through this model.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { productTable } from './product.table';

@model({ settings: { hiddenProperties: ['costPrice'] } })
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

The repository leaves the column out of the `SELECT`, so the value is never read, not read and then stripped. It applies to every read (`find`, `findOne`, `findById`), to rows returned by writes (`create`, `updateById` return the visible properties only), and to relations loaded through `include`: an included `Product` hides its `costPrice` as well.

Use it for values a client must never receive: cost prices, password hashes, internal notes. It does not stop code that queries the table directly with drizzle, and it does not change what you may write: `create({ data: { costPrice: 120 } })` still stores the value.

## 3. query.filter

`query.filter` is a filter merged into every query for the model. Its common use is soft delete: rows stay in the table with `isDeleted = true`, and no query sees them.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { productTable } from './product.table';

@model({
  settings: { query: { filter: { where: { isDeleted: false } } } },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

The `where` is ANDed with the caller's `where` on every `find`, `findOne`, `findById`, `count`, `updateById`, `updateAll` and `deleteAll`. A caller who asks for `{ where: { name: 'Lamp' } }` gets `isDeleted = false AND name = 'Lamp'`.

To read the deleted rows too (an admin screen, a restore job), pass `shouldSkipDefaultFilter`:

```typescript
// src/services/product-admin.service.ts
import type { ProductRepository } from '@/repositories/product.repository';

export const findIncludingDeleted = (opts: { repository: ProductRepository }) => {
  return opts.repository.find({
    filter: { where: { name: 'Lamp' } },
    options: { shouldSkipDefaultFilter: true },
  });
};
```

> [!WARNING] A default filter is a convenience, not security
> `shouldSkipDefaultFilter` is an option any code that calls the repository can pass, and it drops the whole `query.filter`. Use `query.filter` to keep ordinary queries tidy. Use [`access`](#_4-access) when a rule must hold for every caller, because `shouldSkipDefaultFilter` never lifts `access`.

## 4. access

`access` is the row scope of the model. Where `query.filter` is the same for everyone, `access` depends on who is asking: a merchant sees its own products. It is ANDed into every read and write, including `restore` and relations loaded through `include`, and `shouldSkipDefaultFilter` cannot remove it.

`access` applies to relational repositories (Postgres, PGlite, SQLite). A search-backed model (Typesense, Meilisearch) refuses to boot with it; scope a search controller with the [`scope` option](/guides/core-concepts/persistent/search-typesense#scope-the-search-per-request) instead.

### resolve

`resolve()` runs on every query and returns the scope for the current caller. It takes no arguments, so it reads the current request from the ambient request context (turn on `asyncContext.enable` in the application config). It returns one of three outcomes:

| `resolve()` returns | The query |
|---|---|
| A scope `where`, such as `{ merchantId: 'm-1' }` | Runs with that `where` ANDed in |
| `ScopeFilters.UNRESTRICTED` | Runs with no scope, for this call only |
| `null` or `undefined` | Follows `onMissing`: by default it matches zero rows |

```typescript
// src/models/product.model.ts
import { model, ScopeFilters } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId, isPlatformAdmin } from '@/utilities/merchant';
import { productTable } from './product.table';

@model({
  settings: {
    access: {
      resolve: () => {
        if (isPlatformAdmin()) {
          return ScopeFilters.UNRESTRICTED;
        }

        const merchantId = currentMerchantId();
        return merchantId ? { merchantId } : null;
      },
    },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

`UNRESTRICTED` is a symbol, not a string, so no request body, query string or header can produce it: the decision stays in code you wrote. A resolver that forgets a `return` produces `undefined`, which falls to `onMissing`, never to `UNRESTRICTED`.

### onMissing

`onMissing` decides what `null` or `undefined` means.

| `onMissing` | A query with no scope |
|---|---|
| `'deny'` (default) | Matches zero rows. "I do not know who is asking" reads as "nothing" |
| `'allow'` | Runs unscoped |

Keep `'deny'`. `'allow'` is declared once for the whole model, so it also unscopes every ordinary caller whose `resolve()` happens to return nothing. A background job has no request, so its `resolve()` finds no merchant. Give the job an explicit system scope instead of loosening the model:

```typescript
// src/models/product.model.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { model, ScopeFilters } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { productTable } from './product.table';

const systemScope = new AsyncLocalStorage<true>();

/** Runs `task` with no row scope. Call it from jobs and code that is reviewed to work across merchants. */
export const runAsSystem = <T>(task: () => Promise<T>): Promise<T> => {
  return systemScope.run(true, task);
};

@model({
  settings: {
    access: {
      resolve: () => {
        if (systemScope.getStore()) {
          return ScopeFilters.UNRESTRICTED;
        }

        const merchantId = currentMerchantId();
        return merchantId ? { merchantId } : null;
      },
    },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

### write.mode

A scope on reads is not enough: a `create` has no `where` to AND into, so without a check a merchant could insert a product owned by someone else. The write guard holds every created row, and every update payload that names a scope column, to the resolved scope. `write.mode` chooses what happens to a row that is outside it:

- `'reject'` (default): the write is refused and nothing is written.
- `'assign'`: also fills a scope column that is missing from a created row, when the scope is a single equality such as `{ merchantId: 'm-1' }`. A value that is present and disagrees is still refused.

The scope is `{ merchantId: 'm-1' }` for every row of this table:

| The write | `'reject'` | `'assign'` |
|---|---|---|
| `create({ merchantId: 'm-1' })`, the caller's own merchant | Written | Written |
| `create({ merchantId: 'm-2' })`, another merchant | Refused | Refused |
| `create({})`, no `merchantId` | Refused | Written with `merchantId: 'm-1'` |
| `updateById(id, { merchantId: 'm-2' })`, moving a row | Refused | Refused |
| `updateById(id, { name: 'Lamp' })`, not naming the column | Written | Written |
| `createAll([own, own, other])`, one bad row | Refused, nothing written | Refused, nothing written |
| Any of the above under `ScopeFilters.UNRESTRICTED` (an admin, a system job) | Written as given | Written as given, nothing stamped |

The guard reads the allowed values from the resolved `where`: an equality, `eq`, `inq` or `in`, an array, `and` of those, and an `or` whose branches all constrain the same column. Any other shape (an `or` over two columns, a range, `like`) cannot be checked, so the write is refused with a message that says so. It is never skipped.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { productTable } from './product.table';

@model({
  settings: {
    access: {
      resolve: () => ({ merchantId: currentMerchantId() }),
      write: { mode: 'assign' },
    },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

To write across merchants on purpose (an import job, an admin back office), return `ScopeFilters.UNRESTRICTED` from `resolve()` for that caller. There is no other switch: the decision lives in the resolver, in your code.

### sharedRows

Some tables hold rows that belong to no merchant. Say `TaxType`: the platform defines a few shared types, and each merchant adds its own. Shared rows have a `null` `merchantId`.

```typescript
// src/models/tax-type.table.ts
import { generateIdColumnDefs } from '@venizia/ignis/postgres';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';

export const taxTypeTable = pgTable('TaxType', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  merchantId: text('merchant_id'), // null: a shared type
  name: text('name').notNull(),
  rate: integer('rate').notNull(),
});
```

```typescript
// src/models/tax-type.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantIds } from '@/utilities/merchant';
import { taxTypeTable } from './tax-type.table';

@model({
  settings: {
    access: {
      resolve: () => ({
        or: [{ merchantId: { in: currentMerchantIds() } }, { merchantId: null }],
      }),
      write: { sharedRows: false },
    },
  },
})
export class TaxType extends ModelFactory.defineEntity({ table: taxTypeTable }) {}
```

The `null` branch lets the caller read shared rows. Changing a shared row is a different permission, and `sharedRows` grants it:

| | A merchant's own rows | Shared rows (`merchantId` is `null`) |
|---|---|---|
| Read, scope has the `null` branch | Yes | Yes |
| Create, `sharedRows: false` (default) | Yes | No: `null` and a missing column are refused |
| Update, delete, soft delete, restore, `sharedRows: false` | Yes | No: the row does not match, so the count is 0 and it stays as it was |
| Any write, `sharedRows: true` | Yes | Yes |

If your resolver lists `null`, restricted callers still cannot create, change or delete shared rows unless `sharedRows` is `true`. That is true for `updateById`, `updateAll`, `updateBy`, `deleteById`, `deleteAll`, `deleteBy`, soft delete and restore alike: the scope they run under has the `null` branch removed. Set `sharedRows` only on a model where every merchant may write platform-wide rows that all merchants then see. Platform-defined data (a fare policy, a tax type, a promotion) stays `false`; platform staff who manage it use `ScopeFilters.UNRESTRICTED`.

A scope the guard cannot read (an `or` over several columns, a range) cannot be narrowed this way, so an update or a delete under it is refused with a "cannot be verified" message, as a create already was.

### columns

By default the guard checks every column the resolved scope constrains, and finds out which ones when a write happens. `columns` names them up front:

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { productTable } from './product.table';

@model({
  settings: {
    access: {
      resolve: () => ({ merchantId: currentMerchantId() }),
      columns: ['merchantId'],
    },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

Declaring `columns` moves a failure from write time to boot. The application refuses to start if a listed name is not a property of the model (`columns: ['merchentId']` is caught on the first boot, not on the first write). A scope that constrains a column that is not listed is refused as unverifiable.

### What the guard does not cover

- **An update that does not name the scope column.** `updateById(id, { name: 'Lamp' })` is not checked. The row was already selected through the scoped `where`, so it stays inside the scope.
- **Raw drizzle.** A statement you run through the connector, bypassing the repository, is not scoped and not checked.
- **Search-backed models.** They never read `access`.
- **Ownership that lives elsewhere.** A row owned through another table, or by a `principalType` plus `principalId` pair, cannot be written as a `where`. Check it in your service before you write.

### The errors you will see

A refused write is an `ApplicationError` with HTTP status `403` and the code `core.repository.scope_write_denied`. The message names the entity and the column, never a value, because the caller may be a request.

| Message (after the leading `[create]` or `[update]`) | Cause |
|---|---|
| `write refused by the access scope \| entity: Product \| column: merchantId \| the value is outside the resolved scope` | A row names another merchant, or `null` without `sharedRows` |
| `... \| column: merchantId \| the scope column is missing` | A created row has no scope column and the mode is `reject` |
| `... \| the resolved scope cannot be verified on a write \| column 'merchantId': the operator 'gt' cannot be checked on a write` | The scope is an `or` over several columns, a range or another shape the guard cannot read |
| `... \| no scope could be resolved for this caller` | `resolve()` returned `null` and `onMissing` is `'deny'`, on a create |

At boot, `assertScopeFilterSupported` refuses an `access` on a search-backed model, an `access` while `asyncContext.enable` is off (every query would match zero rows), a `write.mode` other than `reject` or `assign`, and `columns` that is empty or names a property the model does not have.

## 5. query.limit

`query.limit` sets the page size for a model.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { productTable } from './product.table';

@model({
  settings: { query: { limit: { default: 20, max: 200 } } },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

`limit.default` applies when a query names no `limit`. `limit.max` is the largest `limit` a caller may ask for. Both must be positive integers; the decorator throws at boot otherwise.

| Request | Result |
|---|---|
| `GET /products` | 20 rows, the model default |
| `GET /products?filter={"limit":50}` | 50 rows |
| `GET /products?filter={"limit":500}` | Refused: 500 is above the ceiling of 200 |

Without `query.limit` the framework defaults apply: 10 rows by default and a ceiling of 1000. Raise the ceiling on purpose: reaching it should mean the caller is doing something unusual.

## 6. authorize.principal

`authorize.principal` names the model for authorization.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { productTable } from './product.table';

@model({ settings: { authorize: { principal: 'Product' } } })
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

The decorator sets `Product.AUTHORIZATION_SUBJECT` to `'Product'`, so a route can read the resource name from the model instead of repeating the string (the value is `undefined` for a model with no principal, hence the fallback):

```typescript
// src/controllers/product.controller.ts
import { AuthorizationActions, ControllerFactory } from '@venizia/ignis';
import { Product } from '@/models/product.model';

const resource = Product.AUTHORIZATION_SUBJECT ?? 'Product';

export const ProductController = ControllerFactory.defineCrudController({
  entity: Product,
  repository: { name: 'ProductRepository' },
  controller: { name: 'ProductController', basePath: '/products' },
  authorize: { action: AuthorizationActions.READ, resource },
  routes: {
    create: { authorize: { action: AuthorizationActions.CREATE, resource } },
    updateById: { authorize: { action: AuthorizationActions.UPDATE, resource } },
    updateBy: { authorize: { action: AuthorizationActions.UPDATE, resource } },
    deleteById: { authorize: { action: AuthorizationActions.DELETE, resource } },
    deleteBy: { authorize: { action: AuthorizationActions.DELETE, resource } },
  },
});
```

The principal only names the model. It decides nothing by itself: the checks come from the `authorize` of the controller and its routes, which say who may call which route. `access` is the second, separate layer: it says which rows that caller reaches. Authorization asks "may this role update products at all"; `access` asks "which products".

The controller-level `authorize` is a default for the routes that declare none, and a write route may not inherit a `read` spec: `defineCrudController` refuses to boot in that case. See [A CRUD write route no longer inherits a read-only authorize](/changelogs/2026-10-25-crud-write-routes-read-authorize) and [Authorization usage](/extensions/components/authorization/usage#crud-factory-integration).

## 7. All together

The full `Product`, and `TaxType` for the shared rows:

```typescript
// src/models/product.model.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { model, ScopeFilters } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { productTable } from './product.table';

const systemScope = new AsyncLocalStorage<true>();

export const runAsSystem = <T>(task: () => Promise<T>): Promise<T> => {
  return systemScope.run(true, task);
};

@model({
  settings: {
    hiddenProperties: ['costPrice'],
    query: {
      filter: { where: { isDeleted: false } },
      limit: { default: 20, max: 200 },
    },
    access: {
      resolve: () => {
        if (systemScope.getStore()) {
          return ScopeFilters.UNRESTRICTED;
        }

        const merchantId = currentMerchantId();
        return merchantId ? { merchantId } : null;
      },
      onMissing: 'deny',
      columns: ['merchantId'],
      write: { mode: 'assign', sharedRows: false },
    },
    authorize: { principal: 'Product' },
  },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

### Which setting do I need?

| I want to ... | Use |
|---|---|
| Never return a column | `hiddenProperties` |
| Hide soft-deleted rows from ordinary queries | `query.filter` |
| Make a rule hold for every caller | `access` (not `query.filter`) |
| Show each merchant only its own rows | `access.resolve` returning a `where` |
| Let an admin or a job see every merchant | `ScopeFilters.UNRESTRICTED` from `resolve` |
| Stop a merchant creating rows for another merchant | The default `write.mode: 'reject'` |
| Fill the merchant on create so callers need not send it | `write.mode: 'assign'` |
| Let merchants create shared rows | `write.sharedRows: true` |
| Catch a misspelled scope column at boot | `access.columns` |
| Smaller or larger pages | `query.limit.default` and `query.limit.max` |
| Name the model for authorization | `authorize.principal` |

## Migrating from the old keys

0.4.2 grouped the settings and 0.4.3 removed the old keys. A model that still uses one throws when the `@model` decorator runs, naming the key to use, so it can never lose its row scope without a sound:

```text
[model][Product] Removed settings key(s): settings.scopeFilter (use settings.access) | removed in 0.4.3 | run 'devz codemod model-settings' to rewrite them
```

| Old | New |
|---|---|
| `defaultFilter` | `query.filter` |
| `defaultLimit` | `query.limit.default` |
| `maxLimit` | `query.limit.max` |
| `scopeFilter` | `access` |
| `scopeFilter.writeGuard` | `access.write.mode` |
| `scopeFilter.sharedRows` | `access.write.sharedRows` |

To rewrite your models mechanically, run `bunx devz codemod model-settings --check` to see the files it would change, then without `--check` to write them. The codemod leaves anything it cannot read for sure, such as a `settings` that is a variable, and prints its file and line. See the [changelog](/changelogs/2026-10-25-model-settings-query-access).

## See also

- [Models reference](/references/base/models-reference) - every field of `IModelSettings`
- [Default filter](/references/base/filter-system/default-filter) and [Fields, order and pagination](/references/base/filter-system/fields-order-pagination)
- [Models](/guides/core-concepts/persistent/models) - declaring a model and its table
- [scopeFilter write guard](/changelogs/2026-10-25-scope-filter-write-guard) - the change that added the write guard
