# Repositories

::: tip Documentation Reorganized
This documentation has been reorganized into focused guides for easier navigation.
:::

## Quick Links

| Guide | Description |
|-------|-------------|
| [**Overview**](./repositories/) | Repository basics, methods, setup |
| [**Filtering & Operators**](./repositories/filtering) | Where clauses, comparison, pattern matching |
| [**Relations & Includes**](./repositories/relations) | Eager loading, nested queries |
| [**JSON Path Filtering**](./repositories/json-filtering) | Query JSONB columns |
| [**Array Operators**](./repositories/array-operators) | PostgreSQL array queries |
| [**Advanced Features**](./repositories/advanced) | Transactions, hidden props, performance |

---

## Quick Start

```typescript
import { DefaultCRUDRepository, repository } from '@venizia/ignis';
import { Todo } from '@/models/todo.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {
  // Inherits: find, findOne, create, updateById, deleteById, etc.
}
```

## Common Operations

```typescript
// Find all active
await repo.find({ filter: { where: { status: 'active' } } });

// Find by ID
await repo.findById({ id: '123' });

// Create
await repo.create({ data: { name: 'New Item' } });

// Update
await repo.updateById({ id: '123', data: { name: 'Updated' } });

// Delete
await repo.deleteById({ id: '123' });
```

---

**[Continue to Overview →](./repositories/)**
