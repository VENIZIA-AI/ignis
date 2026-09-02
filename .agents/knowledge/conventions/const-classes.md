---
type: Convention
title: Const classes over string unions
description: Enumerable string values are a const class plus TConstValue, not a raw string-literal union.
resource: packages/helpers/src/common/types/
tags: [conventions, type-safety]
---

For a fixed set of string values, IGNIS uses a class of `static readonly` fields plus the
`TConstValue` helper type, not a bare string-literal union (`'a' | 'b' | 'c'`).

```typescript
// packages/helpers/src/common/types/const-value.ts
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

## Why

A string-literal union only exists at compile time - there is nothing to iterate, log, or validate
against at runtime. A const class gives both: the values are real runtime properties (usable in a
`Set`, a `switch`, a loop) and `TConstValue<typeof X>` derives the exact literal union for typing,
so the two never drift apart.

## Real examples in source

`BindingNamespaces` in `packages/kernel/src/common/bindings.ts`:

```typescript
export class BindingNamespaces {
  static readonly COMPONENT = BindingNamespaces.createNamespace({ name: 'components' });
  static readonly DATASOURCE = BindingNamespaces.createNamespace({ name: 'datasources' });
  // ...
}
export type TBindingNamespace = TConstValue<typeof BindingNamespaces>;
```

`DataSourceDrivers` in `packages/kernel/src/base/datasources/common/types.ts` goes further: it
derives runtime `Set`s from its own static fields for driver-family checks (`RELATIONAL_SCHEME_SET`,
`SEARCH_SCHEME_SET`), which a string-literal union could never do:

```typescript
export class DataSourceDrivers {
  static readonly NODE_POSTGRES = 'node-postgres';
  static readonly TYPESENSE = 'typesense';
  static readonly RELATIONAL_SCHEME_SET = new Set([this.NODE_POSTGRES, this.POSTGRES_JS]);
}
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});
```

`RuntimeModules` in `packages/helpers/src/common/constants/app.ts` uses the same pattern for
`NODE` / `BUN`, with a `detect()` static method attached directly to the class.

## Related

- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Coding style](/conventions/coding-style.md)
- [Options objects](/conventions/options-objects.md)
