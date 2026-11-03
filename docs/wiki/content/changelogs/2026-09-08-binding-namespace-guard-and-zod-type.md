---
title: A Binding Namespace That Would Lose Its Tag Is Refused
description: BindingNamespaces.createNamespace now throws on a name with a dot, whitespace or nothing, instead of silently losing the binding.
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-08

## A namespace holding a dot is refused

<Badge type="warning" text="Behavior Change" />

**In one line.** `BindingNamespaces.createNamespace` throws when the name holds a `.`, holds whitespace, or is empty, so a binding no longer goes missing silently.

```ts
BindingNamespaces.createNamespace({ name: 'services' }); // 'services'
BindingNamespaces.createNamespace({ name: 'acme.services' }); // throws
```

## What changed

- **A bad namespace throws.** A binding tags itself with the first dot-separated segment of its key, so `acme.services` was tagged `acme`. Nothing drained that tag, and the dependency came back undefined at request time. The mistake now throws at class-initialization time.
- **`BindingNamespaces.CONFIGURATION`.** New. Resolves to `'configurations'`.
- **`z.ZodType` in public types.** `TInferSchema`, `TCustomizableRouteConfig` (`response.schema`), `defineSearchRouteConfigs()` (`selectSchema`) and `deriveSearchDocumentSchema()` name `z.ZodType` where they named the deprecated `z.ZodTypeAny`. The two are one type in zod 4, so your code compiles either way.

## Who is affected

- **You call `createNamespace` with a literal name.** Check the name is a single segment. Every namespace IGNIS ships already is.
- **You pass a namespace string to `BindingKeys.build`.** Nothing changed. `build` still accepts `''` to produce an un-namespaced key.
- **Everyone else.** Nothing to do. No symbol was renamed or removed.

## See also

- [Dependency Injection](../references/base/dependency-injection) - binding keys, namespaces, and how a tag is derived
