---
type: Convention
title: Options objects
description: Fold every argument into one options object first; a second parameter only where that object cannot carry it, never more than 5.
resource: packages/core-server/src
tags: [conventions, api-design]
---

IGNIS functions and constructors fold every argument they can into one options object in the first
position. Write `fn(opts: { key: string })`, not `fn(key: string)`. This applies everywhere: helpers,
repositories, controllers, the container, and internal utilities alike. It is the base rule `V-C-02`.

## The limits

- **A second parameter is allowed only where the first object cannot carry it.** The default is
  still one object. A second parameter needs a reason the first object cannot hold it, not a
  preference.
- **Never more than 5 parameters.** `venizia/max-params-own` (`houseConfigs` in
  `@venizia/dev-configs/linters`, default 5) enforces the cap in lint. It skips signatures that are not
  ours: an inline callback handed to a call or a JSX prop, a function a declared type fixes, and a
  constructor whose every parameter is `@inject`ed - the container fills those positionally
  (C-03).

## A single parameter is not an exception

The rule holds at one parameter. Write `isValidName({ name })`, never `isValidName(name)`.

One positional parameter reads fine until the second one arrives. By then the method is published,
and the cost lands on every caller instead of on the one person writing it. `IStorageHelper` kept
`isValidName(name)`, `isValidPath(path, opts)` and `getMimeType(filename)` positional on exactly that
reasoning; converting them later touched 72 call sites in this repository and broke five in the
downstream consumer.

Mixing the two shapes inside one interface is itself the defect. A reader cannot tell which shape a
method takes without opening it, and neither can a tool.

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
