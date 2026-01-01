# Filter System

Complete reference for the Ignis filter system - operators, JSON filtering, array operators, and query patterns.

> [!NOTE]
> If you're new to Ignis, start with:
> - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Get up and running
> - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Learn the basics
> - [Repositories](/references/base/repositories) - Repository overview


## Filter Structure

The `Filter<T>` object is the core mechanism for querying data in Ignis. It provides a structured, type-safe way to express complex queries without writing raw SQL.

```typescript
type TFilter<T> = {
  where?: TWhere<T>;      // Query conditions (SQL WHERE)
  fields?: TFields<T>;    // Column selection (SQL SELECT)
  order?: string[];       // Sorting (SQL ORDER BY)
  limit?: number;         // Max results (SQL LIMIT)
  skip?: number;          // Pagination offset (SQL OFFSET)
  offset?: number;        // Alias for skip
  include?: TInclusion[]; // Related data (SQL JOIN / subqueries)
};
```


## SQL Mapping Overview

| Filter Property | SQL Equivalent | Purpose |
|-----------------|----------------|---------|
| `where` | `WHERE` | Filter rows by conditions |
| `fields` | `SELECT col1, col2` | Select specific columns |
| `order` | `ORDER BY` | Sort results |
| `limit` | `LIMIT` | Restrict number of results |
| `skip` / `offset` | `OFFSET` | Skip rows for pagination |
| `include` | `JOIN` / subquery | Include related data |


## Basic Example

```typescript
// Filter object
const filter = {
  where: { status: 'active', role: 'admin' },
  fields: ['id', 'name', 'email'],
  order: ['createdAt DESC'],
  limit: 10,
  skip: 0
};

// Equivalent SQL
// SELECT "id", "name", "email"
// FROM "User"
// WHERE "status" = 'active' AND "role" = 'admin'
// ORDER BY "created_at" DESC
// LIMIT 10 OFFSET 0
```


## Quick Reference

| Want to... | Filter Syntax |
|------------|---------------|
| Equals | `{ field: value }` or `{ field: { eq: value } }` |
| Not equals | `{ field: { ne: value } }` |
| Greater than | `{ field: { gt: value } }` |
| Greater or equal | `{ field: { gte: value } }` |
| Less than | `{ field: { lt: value } }` |
| Less or equal | `{ field: { lte: value } }` |
| Is null | `{ field: null }` or `{ field: { is: null } }` |
| Is not null | `{ field: { isn: null } }` |
| In list | `{ field: { in: [a, b, c] } }` |
| Not in list | `{ field: { nin: [a, b, c] } }` |
| Range | `{ field: { between: [min, max] } }` |
| Outside range | `{ field: { notBetween: [min, max] } }` |
| Contains pattern | `{ field: { like: '%pattern%' } }` |
| Case-insensitive | `{ field: { ilike: '%pattern%' } }` |
| Regex match | `{ field: { regexp: '^pattern$' } }` |
| Array contains all | `{ arrayField: { contains: [a, b] } }` |
| Array is subset | `{ arrayField: { containedBy: [a, b, c] } }` |
| Array overlaps | `{ arrayField: { overlaps: [a, b] } }` |
| JSON nested | `{ 'jsonField.nested.path': value }` |
| JSON with operator | `{ 'jsonField.path': { gt: 10 } }` |
| AND conditions | `{ a: 1, b: 2 }` or `{ and: [{a: 1}, {b: 2}] }` |
| OR conditions | `{ or: [{ a: 1 }, { b: 2 }] }` |
| Include relation | `{ include: [{ relation: 'name' }] }` |
| Nested include | `{ include: [{ relation: 'a', scope: { include: [{ relation: 'b' }] } }] }` |
| Select fields | `{ fields: ['id', 'name'] }` |
| Order by | `{ order: ['field DESC'] }` |
| Order by JSON | `{ order: ['jsonField.path DESC'] }` |
| Paginate | `{ limit: 10, skip: 20 }` |
