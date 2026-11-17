---
title: Model settings group hidden and stamped properties, and deletedAt changes only through delete and restore
description: "hiddenProperties becomes properties.hidden, getServerStampedKeys() becomes properties.stamped with a default list, the generated bodies drop deletedAt, a soft-deletable repository refuses deletedAt in an update, and a soft delete can write other columns."
packages: ['@venizia/ignis', '@venizia/ignis-connectors']
---

# Changelog - 2026-11-08

## Model settings group hidden and stamped properties, and deletedAt changes only through delete and restore

<Badge type="warning" text="Breaking" />

**In one line.** `@model` settings take one `properties` group (`hidden` and `stamped`), `hiddenProperties` and `getServerStampedKeys()` are removed, `deletedAt` is no longer written through an ordinary update, and a soft delete can write other columns in the same statement.

## What changed

- **`hiddenProperties` is now `properties.hidden`.** There is no alias. A typed `@model` that still writes `hiddenProperties` fails the typecheck, and any `@model` that still sets it throws when the class is declared: "hiddenProperties was replaced by properties.hidden".
- **`properties.stamped` replaces `getServerStampedKeys()`.** It lists the properties the server fills, which the generated create and update bodies leave out. It takes an array or a Set. Without it the list is `createdBy`, `modifiedBy`, `createdAt`, `modifiedAt` and `deletedAt`, for every model whatever its engine; a key the schema does not hold is ignored. `getServerStampedKeys()` is removed from `AbstractEntity` and `BaseRelationalEntity`, and so is the rule that counted an audit column only when it had a default or `$onUpdate`: an audit column you declare by hand is now dropped from the bodies too.
- **`AuditFields` moves to the kernel.** It holds the default list and is exported from `@venizia/ignis-kernel`.
- **The generated bodies drop `deletedAt`.** It is in the default list. A client that still sends it is not refused: validation strips it and the request goes on. A route with its own `request.body` is unchanged.
- **A refined or transformed schema can stop the controller from building.** Zod cannot remove a key from a schema with checks or from a transformed one. Defining a CRUD controller whose schema holds a stamped key (a refined one) or is transformed (any) and has no `routes.<route>.request.body` throws "Cannot build the default … body | keys to leave out: …".
- **A search collection loses its audit-named fields from the bodies.** Nothing stamps a document, so a collection with a required `createdAt` declares `properties: { stamped: [] }`.
- **An update or upsert that carries `deletedAt` fails with a 400.** On `SoftDeletableRepository` and `SoftDeletableSqliteRepository`, `updateById`, `updateAll`, `updateBy`, `updateEach` and `upsert` refuse a `data` that has `deletedAt`, with any value including `null`. Nothing is written. The delete and restore methods are unchanged.
- **A soft delete can write other columns.** `deleteById`, `deleteAll` and `deleteBy` take an optional `data`, written in the same statement as `deletedAt`. The values and the row selection are checked against the `DELETE` scope. `data` may not carry `deletedAt` or `id`, and it cannot be combined with `shouldHardDelete`. Restore takes no `data`.
- **New repository methods:** validateUpdateData.

## Before and after

```typescript
// Before
@model({ settings: { hiddenProperties: ['costPrice'] } })
class Product extends ModelFactory.defineEntity({ table: productTable }) {}

await repository.updateById({ id, data: { status: 'ARCHIVED', deletedAt: new Date() } });
await repository.updateById({ id, data: { deletedAt: null } });
```

```typescript
// After
@model({ settings: { properties: { hidden: ['costPrice'] } } })
class Product extends ModelFactory.defineEntity({ table: productTable }) {}

await repository.deleteById({ id, data: { status: 'ARCHIVED' } });
await repository.restoreById({ id });
```

```typescript
// A model that fills other keys, or none
@model({ settings: { properties: { stamped: ['createdAt', 'modifiedAt'] } } })
class Event extends ModelFactory.defineEntity({ table: eventTable }) {}

@model({ settings: { properties: { stamped: [] } } })
class Article extends BaseSearchEntity<typeof Article.schema> {}
```

## Security

The extra `data` of a soft delete is checked against the `DELETE` scope only. A role that may delete but not update can therefore set the other columns of the rows it deletes. The scope columns stay guarded: a value outside the scope is still refused with a 403.

## Not covered

- Data built to trick the check, such as a getter that changes between reads or a Proxy, can still set `deletedAt` in server code. Server code is trusted, and a request body cannot be built that way.
- `create` and `createAll` can still insert a row with `deletedAt` set. Only the generated route body drops it.

## Who is affected

- **Every model that sets `hiddenProperties`.** The application throws at boot. Rename it to `properties.hidden`.
- **Code that calls `getServerStampedKeys()`, or an entity that overrides it.** Declare `properties.stamped` on the model instead.
- **Models with a hand-declared audit column the client used to supply** (a required `createdBy`, say). They are dropped from the bodies now. Declare `properties: { stamped: [...] }` without that key.
- **Search collections with a field named like an audit key.** Declare `properties: { stamped: [] }`.
- **Controllers over a refined or transformed schema without a route body.** The application throws while the controller is built. Pass `routes.<route>.request.body`, built from the schema with the stamped keys omitted.
- **Code that sets `deletedAt` through an update or upsert on a soft-deletable repository.** It gets a 400. Delete with `deleteById({ id, data })`, `deleteAll` or `deleteBy`, and revive with `restoreById`, `restoreAll` or `restoreBy`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/helpers/inversion/common/types/model.ts` | kernel |
| `src/base/models/common/constants.ts` | kernel |
| `src/base/controllers/factory/controller.ts` | kernel |
| `src/base/repositories/core/abstract.ts` | kernel |
| `src/relational/core/repositories/core/soft-deletable.ts` | connectors |
| `src/relational/core/repositories/core/persistable.ts` | connectors |
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/search/core/datasources/base.ts` | connectors |
