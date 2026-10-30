---
title: Repository Validation & Security
description: The repository decorator is validated strictly, filters reject unknown columns, two filter security holes are closed, and IREGEXP and a log option are added.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-18

## Repository Validation & Security Improvements

**In one line.** Wrong repository setups and invalid filters now fail loudly instead of silently, and two filter bypasses are fixed.

## What changed

- **`@repository` needs `model` and `dataSource`.** Both are required for schema auto-discovery, and the first constructor parameter must extend `AbstractDataSource`.
- **Filters validate columns.** An unknown column in `where` now throws instead of being ignored.
- **Security.** An empty `IN` array now matches no records (it used to return `true`, bypassing filters). `BETWEEN` now requires an array of exactly 2 elements.
- **PostgreSQL regex.** `REGEXP` uses `~` (case-sensitive). New `IREGEXP` uses `~*` (case-insensitive).
- **`log` option.** All CRUD operations accept `options: { log: { use: true, level: 'debug' } }`.
- **String IDs.** They use a `text` column with a customizable generator (default `crypto.randomUUID()`), for example `text('id').primaryKey().$defaultFn(() => nanoid())`.
- **Datasource schema auto-discovery.** Schema is built from `@repository` bindings.

## Who is affected

- **Anyone with repository classes.** Update constructors and decorators (below).
- **Anyone using `REGEXP` on PostgreSQL.** Behavior now follows the PostgreSQL operators above.
- **Anyone relying on `IN: []` matching everything.** It now matches nothing.

## Breaking changes

> [!WARNING]
> Repository constructors, the `@repository` decorator and filters on unknown columns behave differently.

### 1. Repository constructor signature

**Before:**
```typescript
constructor(opts: {
  entityClass: TClass<BaseEntity<EntitySchema>>;
  relations: { [relationName: string]: TRelationConfig };
  dataSource: IDataSource;
})
```

**After:**
```typescript
constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> })
```

Zero boilerplate (recommended), or pass only the datasource:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) ds: PostgresDataSource,
  ) {
    super(ds);
  }
}
```

### 2. `@repository` requires `dataSource`

**Before:** `@repository({ model: User })` silently failed to register the model.

**After:** it throws `Invalid metadata | Missing 'dataSource'`. Use:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### 3. Constructor parameter type

**Before:** `dataSource: any` compiled.

**After:** use the concrete datasource type:

```typescript
constructor(
  @inject({ key: 'datasources.PostgresDataSource' })
  dataSource: PostgresDataSource,
)
```

### 4. Filter column validation

**Before:**
```typescript
// Silently ignored 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

**After:**
```typescript
// Error: [toWhere] Table: User | Column NOT FOUND | key: 'invalidColumn'
await repo.find({ filter: { where: { invalidColumn: 'value' } } });
```

## Details

- `BETWEEN` with a wrong value throws `[BETWEEN] Invalid value: expected array of 2 elements`.
- `IREGEXP` example: `repo.find({ filter: { where: { name: { IREGEXP: '^john' } } } })`.
