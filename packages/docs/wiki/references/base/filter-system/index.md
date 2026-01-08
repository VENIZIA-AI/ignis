---
title: Filter System Overview
description: Complete reference for the IGNIS filter system
difficulty: intermediate
---

# Filter System

Complete reference for the Ignis filter system - operators, JSON filtering, array operators, default filters, and query patterns.

> [!NOTE]
> If you're new to Ignis, start with:
> - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Get up and running
> - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Learn the basics
> - [Repositories](/references/base/repositories/) - Repository overview

## Prerequisites

Before reading this document, you should understand:

- [Repositories](../repositories/) - Basic repository operations (find, create, update, delete)
- [Models](../models.md) - Entity definitions and schemas
- SQL basics - Understanding of WHERE clauses and operators
- TypeScript type system - Type safety and inference

## Documentation

| Guide | Description |
|-------|-------------|
| [**⚡ Quick Reference**](./quick-reference.md) | **Single-page cheat sheet of all operators** |
| [Comparison Operators](./comparison-operators.md) | Equality, range, null checks |
| [Pattern Matching](./pattern-matching.md) | LIKE, ILIKE, regex |
| [Logical Operators](./logical-operators.md) | AND, OR combinations |
| [List Operators](./list-operators.md) | IN, NOT IN |
| [Range Operators](./range-operators.md) | BETWEEN, NOT BETWEEN |
| [Null Operators](./null-operators.md) | IS NULL, IS NOT NULL |
| [Array Operators](./array-operators.md) | PostgreSQL array operations |
| [JSON Filtering](./json-filtering.md) | JSON/JSONB path queries |
| [Fields, Order, Pagination](./fields-order-pagination.md) | SELECT, ORDER BY, LIMIT |
| [**Default Filter**](./default-filter.md) | Automatic filter application |
| [Application Usage](./application-usage.md) | Filter flow in applications |
| [Tips & Best Practices](./tips.md) | Performance and patterns |
| [Use Cases](./use-cases.md) | Real-world examples |


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
