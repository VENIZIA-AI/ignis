---
title: A Binding Namespace That Would Lose Its Tag Is Refused
description: BindingNamespaces.createNamespace now throws on a name holding a dot, whitespace, or nothing. BindingNamespaces.CONFIGURATION is new. The public types name z.ZodType where they named the deprecated z.ZodTypeAny.
---

# Changelog - 2026-09-08

## A namespace holding a dot is refused

<Badge type="warning" text="Behavior Change" />

**In one line.** `BindingNamespaces.createNamespace` throws when the name holds a `.`, holds whitespace, or is empty.

```ts
BindingNamespaces.createNamespace({ name: 'services' }); // 'services'
BindingNamespaces.createNamespace({ name: 'acme.services' }); // throws
```

## The problem it solves

A `Binding` tags itself with the first dot-separated segment of its key. Give it the namespace `acme.services` and the key `UserService`, and the binding lands under `acme.services.UserService` with the tag `acme`.

Nothing drains that tag. The binding is registered, never configured, and no error says so. You find out when the dependency comes back undefined at request time.

The guard turns that silent miss into a throw at class-initialization time, which is the first moment the mistake exists.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `BindingNamespaces.createNamespace()` | Throws on a name holding `.`, holding whitespace, or empty | kernel |
| `BindingNamespaces.CONFIGURATION` | New. Resolves to `'configurations'` | kernel |
| `TInferSchema<T>` | Constrains `T` to `z.ZodType`, previously `z.ZodTypeAny` | kernel |
| `TCustomizableRouteConfig` | `response.schema` is `z.ZodType`, previously `z.ZodTypeAny` | kernel |
| `defineSearchRouteConfigs()` | `selectSchema` is `z.ZodType`, previously `z.ZodTypeAny` | connectors |
| `deriveSearchDocumentSchema()` | Returns `z.ZodType`, previously `z.ZodTypeAny` | connectors |

## z.ZodTypeAny is gone from the public types

zod 4 deprecates `z.ZodTypeAny`, and declares it as an alias of `z.ZodType` with identical defaults:

```ts
// zod 4.5.4, v4/classic/compat.d.ts
type ZodTypeAny<Output = unknown, Input = unknown, ...> = ZodType<Output, Input, ...>;
```

The two names denote one type, so the 20 changed signatures are a rename. Your code compiles either way, whichever name it writes.

## Who is affected

**You call `createNamespace` with a literal name.** Check the name is a single segment. Every namespace IGNIS ships already is.

**You pass a namespace string to `BindingKeys.build`.** Nothing changed. `build` still accepts `''` to produce an un-namespaced key, as [the reference](../references/base/dependency-injection#bindingkeys-utility) describes.

**Everyone else.** Nothing to do. No symbol was renamed or removed.

## See also

- [Dependency Injection](../references/base/dependency-injection) - binding keys, namespaces, and how a tag is derived
