---
title: Filter a timestamp column with a date string
description: A where on a timestamp or date column now accepts an ISO 8601 string or epoch milliseconds, and a bad value is a 400 instead of a TypeError.
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-08

## Filter a timestamp column with a date string

<Badge type="info" text="Bug Fix" />

**In one line.** A `where` on a timestamp or date column can now carry an ISO 8601 string or epoch milliseconds, which is all a JSON request can send, and a value that is no timestamp is a 400.

## What changed

- **A string or a number is parsed to a `Date`.** On a Postgres `timestamp` or `date` column and on a SQLite `integer({ mode: 'timestamp' })` or `integer({ mode: 'timestamp_ms' })` column, the filter builder now accepts a string for every operator that takes a value: equality, `ne`/`neq`, `gt`, `gte`, `lt`, `lte`, `is`/`isn`, each element of `in`/`inq`/`nin`, both ends of `between`/`notBetween`, and the value inside `not`, `and` and `or`. Before, each of them failed with `value.toISOString is not a function` (Postgres) or `value.getTime is not a function` (SQLite), and a generated CRUD controller answered 500.
- **Accepted forms.** `'2026-11-07'`, a date-time with `T` and `Z` or an offset (`'2026-11-07T10:30:00Z'`, `'2026-11-07T17:30:00+07:00'`), and a finite number of epoch milliseconds. A `Date` and `null` work as before.
- **A bad value is a 400.** A locale string such as `'11/07/2026'`, a word such as `'tomorrow'`, a date that does not exist, a date-time with no zone, a numeric string, `NaN`, a boolean or an object is refused with a 400. The message names the table and the column and lists the accepted forms.
- **SQLite behaves the same as Postgres.** A SQLite `timestamp` column stores seconds, so an instant inside a second compares as that second.

```json
{ "where": { "createdAt": { "gte": "2026-11-01", "lt": "2026-12-01T00:00:00Z" } } }
```

## Who is affected

- **Callers of a generated CRUD controller that filter on a timestamp column.** The same request now works. No action needed.
- **Code that filters with a `Date`.** No change.
- **A column with its own storage type, such as `isoTimestamp`, or a `mode: 'string'` column.** Not converted: it takes the string as written.

## Details

- A date-time with no zone is refused on purpose: it would be read in the server's time zone, so one filter would mean two instants on two servers. Add `Z` or an offset.
- A JSON path such as `'metadata.at'` is not converted.

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/relational/core/repositories/dialect/internal/date-operand.ts` | connectors |
