# Memory Connector

The **memory connector** (`@venizia/ignis/memory`, also re-exported from the root `@venizia/ignis` barrel) is a zero-dependency, `Map`-backed engine that implements the same `AbstractRepository`/`AbstractDataSource` contract as PostgreSQL and typesense - without a database, network calls, or an external process.

## Role: Prototyping and Tests

Use the memory connector when you want to exercise repository/service/controller logic without standing up PostgreSQL:

- **Unit and integration tests** - swap `PostgresDataSource` for `MemoryDataSource` in test setup and get the same `find`/`create`/`updateById`/`deleteAll` surface, in-process, with no I/O.
- **Prototyping** - sketch a model and its repository before a real database schema exists; migrate to PostgreSQL later by changing the `dataSource` in `@repository` and the model's base class.
- **Ephemeral/dev-only data** - anything that doesn't need to survive a process restart.

It is **not** a production datastore: there's no persistence, no relations, no transactions, and no clustering - just an in-process `Map<string, Map<string, Record<string, unknown>>>` (one inner `Map` per collection, keyed by entity name).

## Defining a Collection

The memory connector's "collection definition" is deliberately minimal - just a name:

```typescript
interface IMemoryCollectionDefinition {
  name: string;
}
```

Register a collection by giving your model a static `COLLECTION_NAME` - the datasource auto-discovers every entity bound to it via `@repository`, the same convention-driven discovery PostgreSQL and typesense use. The model extends the engine-neutral `AbstractEntity` directly (there is no engine DSL to carry), so it implements `getSchema()` itself - typically returning a Zod schema:

```typescript
// src/models/entities/note.model.ts
import { AbstractEntity, model, SchemaTypes, TSchemaType } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

export const NoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  archived: z.boolean(),
});

export type TNote = z.infer<typeof NoteSchema>;

@model({ type: 'entity' })
export class Note extends AbstractEntity {
  static readonly COLLECTION_NAME = 'Note';

  constructor() {
    super({ name: Note.COLLECTION_NAME });
  }

  getSchema(opts: { type: TSchemaType }): z.ZodTypeAny {
    switch (opts.type) {
      case SchemaTypes.CREATE: {
        return NoteSchema.partial({ id: true });
      }
      case SchemaTypes.UPDATE: {
        return NoteSchema.partial();
      }
      default: {
        return NoteSchema;
      }
    }
  }
}
```

## Configuring a DataSource

```typescript
// src/datasources/memory.datasource.ts
import { datasource } from '@venizia/ignis';
import { MemoryDataSource } from '@venizia/ignis/memory';

@datasource({ driver: 'memory' })
export class TestDataSource extends MemoryDataSource {
  constructor() {
    super({ name: TestDataSource.name });
  }
}
```

`configure()` discovers every model bound to this datasource, provisions one `Map` per collection name, and stores the resulting definitions as `this.schema`. There's no connection string, pool, or external service to configure - `MemoryDataSource` doesn't override `getCapabilities()`/`beginTransaction()`, so it inherits the engine-neutral defaults (`{ transactions: false }`, and `beginTransaction()` throws `NotSupported`).

## Repository

Unlike PostgreSQL and typesense, the memory connector has **no tiered ladder** - `MemoryRepository` is a single, untiered class implementing every CRUD verb directly, since there's no connection/dialect plumbing to layer progressively:

```typescript
// src/repositories/note.repository.ts
import { repository } from '@venizia/ignis';
import { MemoryRepository } from '@venizia/ignis/memory';
import { Note, TNote } from '@/models/entities/note.model';
import { TestDataSource } from '@/datasources/memory.datasource';

@repository({ model: Note, dataSource: TestDataSource })
export class NoteRepository extends MemoryRepository<TNote> {}
```

```typescript
const noteRepository = new NoteRepository(new TestDataSource());

// Write methods return a { count, data } envelope
const { data: note } = await noteRepository.create({
  data: { title: 'Draft', body: '...', archived: false },
});
await noteRepository.updateById({ id: note.id, data: { archived: true } });

// Read methods return values directly
const notes = await noteRepository.find({ filter: { where: { archived: false } } });
await noteRepository.deleteById({ id: note.id });
```

`find`, `findOne`, `findById`, `count`, `existsWith`, `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll` all accept the same `IExtraOptions` shape as PostgreSQL repositories (`shouldReturn`, `shouldQueryRange`, `shouldSkipDefaultFilter`, `log`) and honor the same `@model` settings (`hiddenProperties`, `defaultFilter`, `defaultLimit`) via the shared `AbstractRepository` getters. `create()` auto-generates `id` via `crypto.randomUUID()` when the input omits it. `filter.include` is **not supported** - the memory connector has no relation model, and passing it throws.

## Operator Vocabulary

The memory connector implements a **deliberately scoped subset** of the neutral `TWhere` operators, chosen for postgres-parity semantics on the operators it does support:

| Operator | Example | Notes |
|---|---|---|
| `eq` (or bare value) | `{ status: 'active' }` / `{ status: { eq: 'active' } }` | |
| `neq` / `ne` | `{ status: { neq: 'archived' } }` | A missing field never matches `neq` |
| `gt` / `gte` / `lt` / `lte` | `{ views: { gte: 100 } }` | Missing/`null` field returns `false` (not a throw) - mirrors SQL `NULL` comparisons being `UNKNOWN` |
| `like` | `{ title: { like: '%TypeScript%' } }` | SQL-style `%`/`_` wildcards, case-sensitive |
| `ilike` | `{ title: { ilike: '%typescript%' } }` | Case-insensitive `like` |
| `inq` / `in` | `{ category: { inq: ['databases', 'devops'] } }` | |
| `nin` | `{ category: { nin: ['draft', 'archived'] } }` | Missing field never matches |
| `between` | `{ views: { between: [100, 1000] } }` | Requires a `[min, max]` tuple |
| `and` / `or` | `{ and: [{ status: 'published' }, { category: 'databases' }] }` | Recursive |
| Bare-array shorthand | `{ category: ['databases', 'devops'] }` | Shorthand for `inq` |

**Not implemented** - these throw `"Unsupported operator"` if used against the memory connector: `is`/`isn`, `nlike`/`nilike`, `regexp`/`iregexp`, `exists`/`notExists`, `contains`/`containedBy`/`overlaps`, `notBetween`, `not`. If your tests rely on these, either restructure the query using a supported operator or test against a real `PostgresDataSource` instead.

Sorting (`order: ['field ASC' | 'field DESC']`) treats a missing/null field as NULLS LAST on ascending order and NULLS FIRST on descending - the same default PostgreSQL's `ORDER BY` uses.

## Limits: No Transactions, No Locks

Like the typesense connector, the memory connector inherits the neutral `NotSupported` behavior for capabilities it doesn't implement:

```typescript
await noteRepository.updateById({
  id: '123',
  data: { archived: true },
  options: { transaction: tx }, // throws: 501, messageCode 'core.not_supported'
});

await noteRepository.findById({
  id: '123',
  options: { lock: { strength: 'update' } }, // throws: 501, messageCode 'core.not_supported'
});
```

Both `beginTransaction()` on the datasource and `transaction`/`lock` options on repository methods throw via the same `throwNotSupported` utility every connector uses for unsupported capabilities - see [Connectors](/references/base/connectors).

## When to Move to PostgreSQL

Because `MemoryRepository` and `PostgresBaseRepository`-derived repositories both extend the same engine-neutral `AbstractRepository`, migrating a prototype is mostly a matter of:

1. Changing the model's base class from `AbstractEntity` to `BasePostgresEntity` and defining a real `pgTable` schema instead of a bare `COLLECTION_NAME`.
2. Changing the repository's base class from `MemoryRepository` to `DefaultCRUDRepository` (or `SoftDeletableRepository`).
3. Swapping the `dataSource` in `@repository({ model, dataSource })` from your `MemoryDataSource` subclass to a `BasePostgresDataSource` subclass.

Calling code (services, controllers) that only uses the neutral `find`/`create`/`updateById`/`deleteAll` surface and `TFilter`/`TWhere` needs no changes.

## See Also

- **Related Concepts:**
  - [Connectors](/references/base/connectors) - Base-vs-connectors architecture, dual-door exports
  - [Search & Typesense](./search-typesense) - The typesense connector
  - [DataSources](/references/base/datasources) - Engine-neutral DataSource contract + PostgreSQL connector
  - [Repositories](/references/base/repositories/) - PostgreSQL connector repository reference (for comparison)

- **Best Practices:**
  - [Testing Strategies](/best-practices/testing-strategies) - Using the memory connector in tests
