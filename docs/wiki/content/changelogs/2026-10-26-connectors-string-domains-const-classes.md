---
title: Connectors String Options Are Const Classes
description: 'Three string options in the connectors package - HTTP read shape, scope write operation and big-number id mode - are const classes with SCHEME_SET and isValid, and the id-type options use TIdSchemaType. The values are unchanged.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## Connectors string options are const classes

<Badge type="tip" text="Enhancement" />

**In one line.** Options typed as a union of string literals are now a const class plus a `TConstValue` type, like `RepositoryTypes`. The values are the same, so existing code keeps compiling.

| Option                                  | Const class            | Type                   | Values             |
| --------------------------------------- | ---------------------- | ---------------------- | ------------------ |
| HTTP `read({ shape })`                  | `HttpReadShapes`       | `THttpReadShape`       | `list`, `one`      |
| Scope write guard `operation`           | `ScopeWriteOperations` | `TScopeWriteOperation` | `create`, `update` |
| `big-number` id `numberMode` (Postgres) | `BigIntModes`          | `TBigIntMode`          | `number`, `bigint` |

## What changed

- **Each class has `SCHEME_SET` and `isValid(value)`.**
- **The id-type options use `TIdSchemaType`** from the kernel package (`number` or `string`): `polymorphicIdType` of the principal enricher, the `dataType` of the user-audit enricher, and the `IdType` generics of `enrichPrincipal` and `generatePrincipalColumnDefs`, in both the Postgres and SQLite enrichers. `TIdSchemaType` is now `TConstValue<typeof IdSchemaTypes>`; the literals `'number'` and `'string'` are still accepted.
- **The literal still works.** `{ polymorphicIdType: 'string' }`, `{ numberMode: 'bigint' }` and `shape: 'one'` compile as before.

## Who is affected

Nobody has to change code. Prefer the class value in new code: `BigIntModes.BIGINT` over `'bigint'`.
