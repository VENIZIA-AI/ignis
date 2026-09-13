---
title: Pattern Matching Operators
description: Operators for string pattern matching and regular expressions
difficulty: intermediate
---

# Pattern Matching Operators

Matches string fields against SQL `LIKE` patterns or POSIX regular expressions.

| Operator | SQL | Meaning |
|----------|-----|---------|
| `like` | `LIKE` | Case-sensitive pattern match |
| `nlike` | `NOT LIKE` | Negated case-sensitive pattern match |
| `ilike` | `ILIKE` | Case-insensitive pattern match |
| `nilike` | `NOT ILIKE` | Negated case-insensitive pattern match |
| `regexp` | `~` | Case-sensitive POSIX regex match (PostgreSQL only) |
| `iregexp` | `~*` | Case-insensitive POSIX regex match (PostgreSQL only) |

> [!NOTE] On SQLite
> `ilike`/`nilike` map to `LIKE`/`NOT LIKE`, because SQLite's own `LIKE` is already ASCII case-insensitive. It is `like` that widens there, not `ilike` that is missing. `regexp`/`iregexp` are rejected with a clear error: SQLite defines no `regexp()` function and libsql registers none, so accepting them would fail at execution on a query that looked accepted.

## like

```typescript
{ where: { email: { like: '%@gmail.com' } } }
// SQL: WHERE "email" LIKE '%@gmail.com'
```

**Notice:** `%` matches any sequence of characters (including none); `_` matches exactly one character.

**Edge cases:**
- A `null` operand compiles to `LIKE NULL`, which is never true - no rows match.
- Case sensitivity follows the column's collation; the default is case-sensitive.

## nlike

```typescript
{ where: { email: { nlike: '%@test.com' } } }
// SQL: WHERE "email" NOT LIKE '%@test.com'
```

**Notice:** `NOT LIKE` excludes rows where the column is `NULL`, the same as `NOT IN`.

**Edge cases:**
- Same pattern-character rules as `like`.

## ilike

```typescript
{ where: { name: { ilike: '%john%' } } }
// SQL: WHERE "name" ILIKE '%john%'
```

**Notice:** matches `'John'`, `'JOHN'`, and `'john'` alike.

**Edge cases:**
- `ILIKE` is a PostgreSQL extension, not standard SQL. The SQLite dialect maps `ilike` to `LIKE`, which is ASCII case-insensitive there anyway. The residual gap is non-ASCII: `'ÉCOLE' LIKE 'é%'` is false without ICU.
- Same pattern-character rules as `like`.

## nilike

```typescript
{ where: { email: { nilike: '%@example%' } } }
// SQL: WHERE NOT ("email" ILIKE '%@example%')
```

**Notice:** built as a negated `ILIKE`, not a dedicated SQL operator.

**Edge cases:**
- Same `NULL`-excludes-nothing behavior as `nlike`.

## regexp

```typescript
{ where: { code: { regexp: '^[A-Z]' } } }
// SQL: WHERE "code" ~ '^[A-Z]'
```

**Notice:** `~` is PostgreSQL's case-sensitive POSIX regex operator.

**Edge cases:**
- Escape backslashes in TypeScript strings: `\\d` for regex `\d`.
- No shape validation - any string operand is passed through as the pattern.

## iregexp

```typescript
{ where: { name: { iregexp: '^john' } } }
// SQL: WHERE "name" ~* '^john'
```

**Notice:** same as `regexp`, but case-insensitive (`~*`).

**Edge cases:**
- Matches `'John Doe'`, `'JOHN SMITH'`, and `'john'` alike.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [JSON Filtering](./json-filtering) - pattern operators also work on a `'column.path'` key, with no numeric casting
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/connectors/src/relational/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
