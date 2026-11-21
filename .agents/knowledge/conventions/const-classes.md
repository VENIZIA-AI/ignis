---
type: Convention
title: Const classes over string unions
description: Enumerable string values are a const class plus TConstValue, not a raw string-literal union.
resource: packages/helpers/src/common/
tags: [conventions, type-safety]
---

For a fixed set of string values, IGNIS uses a class of `static readonly` fields plus the
`TConstValue` helper type, not a bare string-literal union (`'a' | 'b' | 'c'`).

```typescript
// packages/helpers/src/common/types/const-value.ts
export type TConstValue<T extends TClass<unknown>> = Extract<ValueOf<T>, string | number> & {};
```

The `& {}` stops the union widening back to `string` - see [gotchas](/conventions/gotchas.md#a-const-value-alias-without-the-empty-intersection-widens-to-string).

A class that holds only string values extends `ConstClass` (`packages/helpers/src/common/const-class.ts`,
exported from `@venizia/ignis-helpers/common`). It adds two statics, so no class writes its own `SCHEME_SET` or
`isValid`:

```typescript
export class ArtifactTypes extends ConstClass {
  static readonly SERVICE = 'service';
  static readonly COMPONENT = 'component';
}

ArtifactTypes.isValid(input);          // narrows input to TConstValue<typeof ArtifactTypes>
z.enum(ArtifactTypes.values());        // a non-empty tuple of the literal union
```

- `values()` returns the string statics in declaration order, the values of a base class first when the class
  extends another const class (`ServerBootSteps extends BootSteps`). It is cached per class and throws when the
  class holds no string.
- `values` and `isValid` are reserved names; a value cannot be named either.
- `isValid(value: unknown)` is `typeof value === 'string'` plus a membership check, as a type guard.
- A class stays hand-written (own `SCHEME_SET`, own `isValid`) when it is not a plain list of strings: other string
  statics that are not values (`SOURCE_GLOB`), derived or grouped sets (`RELATIONAL_SCHEME_SET`), number values,
  object values, or a set built from other data. `devz codemod const-classes` converts the plain ones.
- `@venizia/ignis-dev-configs` does not depend on helpers, so its own const classes stay hand-written.

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
`BUN`, with a `detect()` static method attached directly to the class.

## Related

- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Coding style](/conventions/coding-style.md)
- [Options objects](/conventions/options-objects.md)
