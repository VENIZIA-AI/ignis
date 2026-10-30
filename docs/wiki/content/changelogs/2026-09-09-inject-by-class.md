---
title: A Dependency Can Now Name Its Class Instead Of Its Key
description: '@inject({ target: SomeService }) resolves a dependency by class, and an artifact must now register under a usable namespace.'
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-09

## A dependency can now name its class instead of its key

<Badge type="warning" text="Behavior Change" />

**In one line.** The class was already in the expression; now it is the whole expression.

```ts
// before
@inject({
  key: BindingKeys.build({ key: ValidationService.name, namespace: BindingNamespaces.SERVICE }),
})
private readonly validationService: ValidationService,

// after
@inject({ target: ValidationService })
private readonly validationService: ValidationService,
```

## What changed

- **`@inject({ target })`.** Works on constructor parameters and properties. `@inject({ key })` is unchanged. A call site names either a key or a class, never both.
- **Resolves the real key.** The key is recorded on the class by `@service`, `@repository`, `@controller`, `@component`, `@datasource` and `@model`, and overwritten by `registerArtifact` with the key actually bound. So a class registered by hand, or with a `binding` override, still resolves.
- **A namespace is required (Behavior Change).** A key with no leading namespace segment is untagged, so no boot step drains it and `bootChecks.binding.doVerify` never resolves it. Registration now refuses an empty namespace, or one carrying a `.` or whitespace. A declared `binding` is checked at import time; a `TMixinOpts.binding` is checked at registration. `BindingNamespaces.createNamespace({ name })` still works.
- **Clear failures.** A class the container was never told about fails by name: `Constructor parameter 0 names 'StrangerService', which is not registered as an artifact`. A decorated class that was not registered fails with the usual `services.X is not bounded in context!`. With `bootChecks.binding.doVerify` on, both surface at boot.

## Who is affected

- **Every `@inject({ key })` you have written.** Nothing. The form is untouched.
- **New code.** Prefer `{ target }` when the dependency is a registered class.
- **You implemented your own container.** `Container.instantiate` now resolves through a protected `resolveBindingKey`; override it if your container invents keys of its own.

## Details

- A subclass does not inherit its parent's key: `class B extends A` where only `A` is registered resolves nothing.
- `@provide({ key })` names a plain string and is unchanged.
- The `middlewares`, `providers` and `configurations` namespaces carry no artifact type and are reachable only by key.
