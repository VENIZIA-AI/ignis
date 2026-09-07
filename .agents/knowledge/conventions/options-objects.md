---
type: Convention
title: Options objects
description: Every function takes a single options object, never positional parameters.
resource: packages/core-server/src
tags: [conventions, api-design]
---

IGNIS functions and constructors take one options object, never a positional argument list.
Write `fn(opts: { key: string })`, not `fn(key: string)`. This applies everywhere: helpers,
repositories, controllers, the container, and internal utilities alike.

## Why

- **Additive evolution without breaking call sites.** A new optional field on the options type
  never forces every caller to update. A new positional parameter does.
- **Self-documenting call sites.** `create({ data, options: { shouldReturn: false } })` reads
  correctly at the call site with no need to check the signature. `create(data, false)` does not.
- **Overload-friendly.** Repository methods commonly need different return types depending on an
  option value, and TypeScript overloads on a single options parameter stay readable.

## In source

`PersistableRelationalRepository.create` in
`packages/connectors/src/relational/core/repositories/core/persistable.ts` overloads purely on the
shape of one options object:

```typescript
override create(opts: {
  data: PersistObject;
  options: ExtraOptions & { shouldReturn: false };
}): Promise<TCount & { data: undefined | null }>;
override create<R = DataObject>(opts: {
  data: PersistObject;
  options?: ExtraOptions & { shouldReturn?: true };
}): Promise<TCount & { data: R }>;
```

The postgres-specific `PersistableRepository` is an empty subclass and inherits these overloads
unchanged, so the engine-neutral relational tier is where the shape is defined.

`BaseHelper` in `packages/helpers/src/modules/base.ts` follows the same rule for construction:
`constructor(opts: { scope: string; identifier?: string })`.

## The one place this is enforced strictly for DI

Controllers must not take a raw, undecorated `opts` constructor parameter alongside injected ones
- see [coding-style](/conventions/coding-style.md) and [gotchas](/conventions/gotchas.md) for why
the container cannot mix decorated and undecorated parameters. Options a controller needs go inside
`super({ scope: X.name })`, not as a constructor parameter.

## Related

- [Coding style](/conventions/coding-style.md)
- [Const classes](/conventions/const-classes.md)
- [Gotchas](/conventions/gotchas.md)
- [DI container](/architecture/di-container.md)
