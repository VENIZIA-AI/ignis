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
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
import { PostgresIdEnricher, PostgresTzEnricher } from '@venizia/ignis-connectors/postgres';
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const productTable = pgTable('Product', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  ...PostgresTzEnricher.generateColumnDefs(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
  costPrice: integer('cost_price').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
});
```

The merchant of the current request comes from the authenticated user. This helper is used by the examples below; `RequestContextRegistry` reads the ambient request context, which needs `asyncContext.enable` (on by default in a `BaseApplication`):

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
| `access.resolve` | required unless `through` | Returns the row scope of the current caller, per query |
| `access.through` | none | Scopes a child model by its parent's own `access`, instead of `resolve`. See [Scope a child through its parent](#scope-a-child-through-its-parent) |
| `access.onMissing` | `'deny'` | What happens when `resolve()` returns `null` or `undefined` |
| `access.columns` | none | Names the columns the write guard checks; validated at boot |
| `access.write.mode` | `'reject'` | What a create or update does with a row outside the scope |
| `access.write.sharedRows` | `false` | Lets a restricted caller create, change and delete rows with no owner (`null` scope column) |
| `authorize.principal` | none | The authorization subject name of the model |

Settings are grouped by what they do. `query` shapes what a query returns. `access` decides who may read and write rows. `hiddenProperties` and `authorize` stand alone. The old flat names (`defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter`) are removed; the [changelog](/changelogs/2026-11-03-old-model-settings-keys-are-removed) maps each to its new key.

## 2. hiddenProperties

`hiddenProperties` lists properties that must never leave the database through this model.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { productTable } from './product.table';

@model({ settings: { hiddenProperties: ['costPrice'] } })
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

The repository leaves the column out of the `SELECT`, so the value is never read, not read and then stripped. It applies to every read (`find`, `findOne`, `findById`), to rows returned by writes (`create`, `updateById` return the visible properties only), and to relations loaded through `include`: an included `Product` hides its `costPrice` as well.

A client cannot ask about a hidden property either. A `where` or an `order` on one would reveal its value one question at a time, so the generated CRUD controllers and the generated search controllers answer a request filter that names a hidden property with `400`, the very error a column that does not exist gets: in the `where` (at any depth of `and` and `or`, JSON paths in any spelling included), in the `order`, and in the `scope` of an `include`, where each level is judged by the properties its own model hides. The repository's own methods are not held to this, so server code can still filter and sort on a hidden property.

Use it for values a client must never receive: cost prices, password hashes, internal notes. It does not stop code that queries the table directly with drizzle, and it does not change what you may write: `create({ data: { costPrice: 120 } })` still stores the value.

## 3. query.filter

`query.filter` is a filter merged into every query for the model. Its common use is soft delete: rows stay in the table with `isDeleted = true`, and no query sees them.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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

`resolve()` runs on every query and returns the scope for the current caller. It reads the current request from the ambient request context (`asyncContext.enable` is on by default in a `BaseApplication`). Its one argument, `{ operation }`, says what the call does: `ScopeOperations.READ`, `CREATE`, `UPDATE` or `DELETE`. A resolver that ignores the operation takes no parameter. It returns one of three outcomes:

| `resolve()` returns | The query |
|---|---|
| A scope `where`, such as `{ merchantId: 'm-1' }` | Runs with that `where` ANDed in |
| `ScopeFilters.UNRESTRICTED` | Runs with no scope, for this call only |
| `null` or `undefined` | Follows `onMissing`: by default it matches zero rows |
| Anything else that is not a usable `where`: `false`, `0`, `''`, a list, `{}`, an object with an `undefined` value (`{ merchantId: user.merchantId }` for a user without one), an empty `and` | The same as `null`: the scope was not resolved. An empty `or` matches nothing |

```typescript
// src/models/product.model.ts
import { model, ScopeFilters } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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

### Read wider than you write

A marketplace order is visible to its merchant and to the counterpart merchant. Only the merchant may change it. One scope cannot say both, so `resolve` receives the operation and answers each one:

```typescript
// src/models/order.model.ts
import { model, ScopeOperations } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { orderTable } from './order.table';

@model({
  settings: {
    access: {
      resolve: ({ operation }) => {
        const merchantId = currentMerchantId();
        if (!merchantId) {
          return null;
        }

        return ScopeOperations.includes({ group: ScopeOperations.WRITE, operation })
          ? { merchantId }
          : { or: [{ merchantId }, { counterpartMerchantId: merchantId }] };
      },
    },
  },
})
export class Order extends ModelFactory.defineEntity({ table: orderTable }) {}
```

A read sees both columns. A create, an update and a delete are held to `merchantId` alone, and an update or delete reaches only the caller's own rows.

`operation` is always one of four values. Every repository call passes one:

| Call | `operation` |
|---|---|
| `find`, `findOne`, `findById`, `count`, `existsWith`, and a relation loaded through `include` | `READ` |
| `create`, `createAll` | `CREATE` |
| `updateById`, `updateAll`, and `restore` | `UPDATE` |
| `deleteById`, `deleteAll`, `deleteBy`, a soft delete included | `DELETE` |

A soft delete is stored as an update of the row, but the resolver sees `DELETE`: a caller who may update a row is not thereby allowed to delete it. The soft-delete flag (`deletedAt`) is an ordinary column, though. An `updateAll` that writes it soft-deletes the row under the `UPDATE` scope, not the `DELETE` one. To keep `UPDATE` from deleting, do not let callers write that column, or check it in the service. A read with a row `lock` (`findOne` with `lock`) still passes `READ`, so it can lock rows the caller may only read.

`ScopeOperations.WRITE` and `ScopeOperations.ALL` are groups, never an `operation`. Ask `includes({ group, operation })` whether an operation belongs to one.

Returning the `or` for a write operation is still refused, with the same "cannot be verified" message. Return the narrow scope for that operation instead.

### onMissing

`onMissing` decides what `null` or `undefined` means.

| `onMissing` | A query with no scope |
|---|---|
| `'deny'` (default) | Matches zero rows. "I do not know who is asking" reads as "nothing" |
| `'allow'` | Runs unscoped |

The two values are also `ScopeFilterMissingBehaviors.DENY` and `ScopeFilterMissingBehaviors.ALLOW`, exported by `@venizia/ignis`.

Keep `'deny'`. `'allow'` is declared once for the whole model, so it also unscopes every ordinary caller whose `resolve()` happens to return nothing. A background job has no request, so its `resolve()` finds no merchant. Give the job an explicit system scope instead of loosening the model:

```typescript
// src/models/product.model.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { model, ScopeFilters } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
- `'assign'` (`ScopeWriteGuards.ASSIGN`; `'reject'` is `ScopeWriteGuards.REJECT`): also fills a scope column that is missing from a created row, when the scope is a single equality such as `{ merchantId: 'm-1' }`. A value that is present and disagrees is still refused.

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

The guard reads the allowed values from the resolved `where`: an equality, `eq`, `inq` or `in`, an array, `and` of those, and an `or` whose branches all constrain the same column. Any other shape (an `or` over two columns, a range, `like`) cannot be checked, so the write is refused with a message that says so. It is never skipped. To read two columns and write one, [return the narrow scope for a write operation](#read-wider-than-you-write).

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
import { PostgresIdEnricher } from '@venizia/ignis-connectors/postgres';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';

export const taxTypeTable = pgTable('TaxType', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  merchantId: text('merchant_id'), // null: a shared type
  name: text('name').notNull(),
  rate: integer('rate').notNull(),
});
```

```typescript
// src/models/tax-type.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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

A scope the guard cannot read (an `or` over several columns, a range) cannot be narrowed this way, so an update or a delete under it is refused with a "cannot be verified" message, as a create already was. This holds with `sharedRows: true` too: it lets the `null` rows through, not a shape the guard cannot read.

### columns

By default the guard checks every column the resolved scope constrains, and finds out which ones when a write happens. `columns` names them up front:

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
- **Ownership that lives elsewhere.** A row owned through another table, or by a `principalType` plus `principalId` pair, cannot be written as a `where`. See [Ownership through a parent](#ownership-through-a-parent).

### Scope a child through its parent

A model that has only a foreign key to its parent can inherit the parent's scope instead of copying a tenant column. Declare it with `ScopeThrough.of`, which checks the relation name against the model:

```typescript
// src/models/variant.model.ts
import { model, ScopeThrough } from '@venizia/ignis';
import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
import { productTable } from './product.table';
import { variantTable } from './variant.table';

const VariantBase = ModelFactory.defineEntity({
  table: variantTable,
  relations: () => ({ product: one(productTable) }),
});

@model({
  settings: {
    access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) },
  },
})
export class Variant extends VariantBase {}
```

#### A hand-written entity

`ScopeThrough.of` reads the entity's static `relationDefinitions` for its type only. `ModelFactory.defineEntity` supplies it. An entity you write by hand declares it next to `relations`, from one object, so the name is checked the same way:

```typescript
// src/models/variant.model.ts
import { model, ScopeThrough } from '@venizia/ignis';
import { BaseEntity, one, RelationDeclarations } from '@venizia/ignis-connectors/postgres';
import { productTable } from './product.table';
import { variantTable } from './variant.table';

const relations = { product: one(productTable) };

class VariantBase extends BaseEntity<typeof variantTable> {
  static override schema = variantTable;
  static readonly relationDefinitions = relations;
  static override relations = () => RelationDeclarations.toRelationConfigs({ relations });
}

@model({
  settings: {
    access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) },
  },
})
export class Variant extends VariantBase {}
```

A to-many relation or a misspelled name does not compile. If you annotate the member, use a type alias such as `{ product: { type: typeof RelationTypes.ONE } }`; an `interface` is refused. An entity with no `relationDefinitions` cannot be passed to `ScopeThrough.of`.

A read of `Variant` keeps the rows whose `productId` is in the set that `Product`'s own `access` allows:

```sql
variant.product_id IN (SELECT product.id FROM product WHERE <Product's scope>)
```

- **The parent decides.** `Product` keeps its `access.resolve`. A change to its scope reaches every child with no edit. The `operation` the child call passes (`READ`) is the one `Product`'s `resolve` receives.
- **Several hops.** Each model declares its own one hop: an `Option` through `Variant`, `Variant` through `Product`. A chain is at most 5 hops, and the application refuses to start on a longer one or on a cycle.
- **`UNRESTRICTED` and `null`** come from the parent: an unrestricted parent leaves the child unrestricted for that call, and a parent that cannot resolve a scope denies the child. A `through` model has no `onMissing`: `'allow'` would show the child's rows of every tenant while the parent shows none, so the application refuses to start with one.
- **A row with a null foreign key** matches no parent, so under a restricting scope it is invisible. Under `UNRESTRICTED` the whole table is visible, such rows included.
- **`include`** applies the included model's own scope, so a `through` child loaded through any relation is scoped too.
- **Writes name a parent the caller may reach.** See [Writes through a parent](#writes-through-a-parent).
- **`through` replaces `resolve`.** A model declares one of them; `columns` and `write` belong to `resolve` only. At boot the application checks that the relation is a `one` with a single-column key, that the parent has an `access`, and warns when the foreign key has no index.

Index the child's foreign key: without it every scoped list or count scans the child table.

#### Writes through a parent

A create must name a parent the caller may reach, and an update that moves a row must name its new parent the same way. One query checks the whole batch, using the parent's own scope for the write's `operation` (`CREATE` for a create, `UPDATE` for a move):

```sql
SELECT parent.pk FROM parent WHERE parent.pk IN (<the keys the rows name>) AND <parent's scope>
```

- **One refusal.** A parent that does not exist, a parent outside the caller's scope, a null key and a missing key all give the same `403` (`core.repository.scope_write_denied`). The message names the model and the foreign key column, so it does not tell a caller whether a foreign parent exists.
- **A batch is all or nothing.** `createAll` with one foreign parent writes nothing.
- **Update and delete** select the rows with the child's scope, built from the parent's scope for `UPDATE` or `DELETE`. A payload that does not name the foreign key checks no parent. A soft delete counts as a delete.
- **One transaction.** The check and the write run in the same transaction: the caller's, or one the repository opens and commits. On Postgres the checked parents are read `FOR SHARE`, so a parent that moves to another tenant after the check cannot be missed. SQLite has no row lock; its transactions begin `IMMEDIATE`, which excludes every other writer. A caller who opens a deferred SQLite transaction on purpose weakens that.
- **`UNRESTRICTED`** from the parent skips the scope and still requires the parent to exist. A parent that resolves `null` refuses the write.
- **The parent column should be unique.** The relation normally points at the parent's primary key. If it points at another column, make it unique: the check counts distinct keys, so a key that matches two parent rows still counts once, but a non-unique column can make one child belong to several parents.
- **A parent can read wide and write narrow.** The check asks the parent for the write's own operation, so the parent's write scope governs the child's writes, and its read scope only the child's reads.
- **The parent's `write.sharedRows` holds on every hop.** A parent row whose scope column is `null` is shared: the read scope opens it, and only `write.sharedRows: true` on the parent lets a write reach it. Without it, the children of a shared parent are readable but cannot be updated or deleted, and a create or a move cannot name a shared parent. This is the narrowing a direct write to the parent gets, so a parent scope the write guard cannot verify refuses the child's write too. At two hops, `Option` through `Variant` through `Product` answers to `Product`'s `sharedRows`.
- **A model with `through` cannot use `write.sharedRows` or `write.mode` itself:** there is no scope column on the child to fill or to leave null. It follows the parent's.

#### `through` or a copied column

Measured on Postgres 17 with 372,000 parents, 389,000 children and 200 tenants of very uneven size (warm cache, medians):

| Case | `through` | Copied column |
|---|---|---|
| Reads, updates and deletes by id | +0.01 to +0.3 ms per 100 ids | none |
| The query already joins the parent | +1.3 ms on a small tenant, +3 to +4 ms (+7 to 9%) on the largest | +0.3 ms or less |
| A page sorted by a child column, or a count, for the largest tenant | about 70 ms and 68 ms | 0.02 ms and 15 ms, with a `(tenant, created_at desc, id desc)` index |
| The same for a small tenant | about 2 ms | under 0.1 ms |

Use `through` for the many child tables where this cost does not show and one source of truth matters. Copy the column only for a hot list, sorted or counted, under a very large tenant. Both need the child foreign key indexed.

### Ownership through a parent

A product variant has a `productId` and no merchant. The merchant lives on the `Product`. `access.resolve` returns a plain `where` over the model's own columns, with no relation path, so it cannot say "the variants of my products". Code can return an `inSql` subquery, such as ``{ productId: { inSql: sql`select id from "Product" where merchant_id = ${merchantId}` } }``. That scopes reads, but the write guard refuses every create, update and delete under it ("the operator 'inSql' cannot be checked on a write"). An `include` does not help either: an included model applies its own `access`, never its parent's.

Declare [`access.through`](#scope-a-child-through-its-parent) for reads and writes. When the check cannot be a scope, two patterns remain.

#### Copy the tenant column onto the child

Give `Variant` its own `merchantId` and fill it from the product when you create the variant. `access` then works on `Variant` as it does on `Product`, including the write guard.

```typescript
// src/models/variant.table.ts
import { PostgresIdEnricher } from '@venizia/ignis-connectors/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const variantTable = pgTable('Variant', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  productId: text('product_id').notNull(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
});
```

```typescript
// src/models/variant.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { currentMerchantId } from '@/utilities/merchant';
import { variantTable } from './variant.table';

@model({
  settings: {
    access: {
      resolve: () => {
        const merchantId = currentMerchantId();
        return merchantId ? { merchantId } : null;
      },
    },
  },
})
export class Variant extends ModelFactory.defineEntity({ table: variantTable }) {}
```

A request with no merchant returns `null`, which falls to `onMissing`: it denies by default.

The service reads the product through the scoped `ProductRepository`, so a product outside the caller's scope comes back as `null`. It copies the merchant from that row:

```typescript
// src/services/variant.service.ts
import { BaseService, inject, service } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { ProductRepository, VariantRepository } from '../repositories';

@service()
export class VariantService extends BaseService {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private productRepository: ProductRepository,

    @inject({ key: 'repositories.VariantRepository' })
    private variantRepository: VariantRepository,
  ) {
    super({ scope: VariantService.name });
  }

  async createVariant(opts: { productId: string; name: string }) {
    const product = await this.productRepository.findById({ id: opts.productId });
    if (!product) {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.NotFound, message: 'Product not found' });
    }

    return this.variantRepository.create({
      data: { productId: product.id, merchantId: product.merchantId, name: opts.name },
    });
  }
}
```

The write guard still holds the variant to the caller's scope, so a copy that disagrees with the caller is refused.

The cost: the copy must stay in step with the product. If a product can move to another merchant, update its variants in the same transaction.

#### Check through the parent's scoped repository

Some ownership `resolve` cannot express at all: a `principalType` plus `principalId` pair, or a parent chain with no column to copy. Before you read or write the child, ask the owner's scoped repository. It returns `null` for a row outside the caller's scope, and you refuse on `null`.

```typescript
// src/services/variant.service.ts (inside VariantService)
async updateVariantName(opts: { id: string; name: string }) {
  const variant = await this.variantRepository.findById({ id: opts.id });
  if (!variant) {
    throw getError({ statusCode: HTTP.ResultCodes.RS_4.NotFound, message: 'Variant not found' });
  }

  const owner = await this.productRepository.findById({ id: variant.productId });
  if (!owner) {
    throw getError({ statusCode: HTTP.ResultCodes.RS_4.NotFound, message: 'Variant not found' });
  }

  return this.variantRepository.updateById({ id: opts.id, data: { name: opts.name } });
}
```

This is a check in your code, not a scope: nothing stops another code path from reading `Variant` directly, so route every read and write of the child through the service. Prefer the first pattern when a column can be copied, because the scope then holds for every caller.

### The errors you will see

A refused write is an `ApplicationError` with HTTP status `403` and the code `core.repository.scope_write_denied`, held by `RepositoryErrorCodes.SCOPE_WRITE_DENIED` for code that matches on it. The message names the entity and the column, never a value, because the caller may be a request.

| Message (after the leading `[create]` or `[update]`) | Cause |
|---|---|
| `write refused by the access scope \| entity: Product \| column: merchantId \| the value is outside the resolved scope` | A row names another merchant, or `null` without `sharedRows` |
| `... \| column: merchantId \| the scope column is missing` | A created row has no scope column and the mode is `reject` |
| `... \| the resolved scope cannot be verified on a write \| column 'merchantId': the operator 'gt' cannot be checked on a write` | The scope is an `or` over several columns, a range or another shape the guard cannot read |
| `... \| no scope could be resolved for this caller` | `resolve()` returned `null` and `onMissing` is `'deny'`, on a create |

At boot, `ScopeFilterUtility.assertScopeFilterSupported` runs as the last boot step of a `BaseApplication` and refuses four kinds of model:

- **Search-backed.** An `access` on a model whose repository never reads it.
- **No async context.** An `access` while `asyncContext.enable` is off (every query would match zero rows).
- **Bad write guard.** A `write.mode` other than `reject` or `assign`, and `columns` that is empty or names a property the model does not have.
- **Bad `through`.** A model with both or neither of `resolve` and `through`, `onMissing`, `columns` or `write` next to `through`, a relation that is not a `one` with a single-column key, a parent with no `access`, a cycle, or a chain longer than 5 hops.

`ApplicationBootAssertion.assert` runs the same step, so a boot test catches them; `skipSteps` can leave it out. A `WorkerApplication` has no such step: nothing validates `access` there.

## 5. query.limit

`query.limit` sets the page size for a model.

```typescript
// src/models/product.model.ts
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
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

## See also

- [Models reference](/references/base/models-reference) - every field of `IModelSettings`
- [Default filter](/references/base/filter-system/default-filter) and [Fields, order and pagination](/references/base/filter-system/fields-order-pagination)
- [Models](/guides/core-concepts/persistent/models) - declaring a model and its table
- [scopeFilter write guard](/changelogs/2026-10-25-scope-filter-write-guard) - the change that added the write guard
