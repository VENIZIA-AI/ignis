---
title: A Dependency Can Now Name Its Class Instead Of Its Key
description: '@inject({ target: SomeService }) resolves through the key the registration recorded, so a call-site binding override and a class registered by hand both work. @inject({ key }) is untouched.'
---

# Changelog - 2026-09-09

## A dependency can now name its class instead of its key

**In one line.** The class was already in the expression; now it is the whole expression.

```ts
// before - three lines to restate what the framework already derived
@inject({
  key: BindingKeys.build({ key: ValidationService.name, namespace: BindingNamespaces.SERVICE }),
})
private readonly validationService: ValidationService,

// after
@inject({ target: ValidationService })
private readonly validationService: ValidationService,
```

Both forms work. `@inject({ key })` is unchanged and nothing has to move.

## How the key is found

The key is **recorded on the class**, by the two places that already compute it:

- `@service`, `@repository`, `@controller`, `@component`, `@datasource`, `@model` record the key they
  would derive, at import time.
- `registerArtifact` overwrites it with the key actually bound, at registration.

The second write is what makes the awkward cases work. Deriving `<namespace>.<Class>` from metadata
alone is wrong in three shapes that exist in production today:

| Shape | What derivation would say | What is recorded |
|---|---|---|
| `application.service(SomeService)` with no decorator | nothing to derive from | `services.SomeService` |
| `@service({ binding: { namespace: SERVICE, key: 'otp-sender' } })` | `services.SmsOtpSender` | `services.otp-sender` |
| `application.service(Svc, { binding: { key: 'Other' } })` | `services.Svc` | `services.Other` |

## An artifact must register under a namespace

<Badge type="warning" text="Behavior Change" />

`Binding` tags itself with the first dot-separated segment of its key, and only when there is more
than one. A key with no namespace is therefore **untagged**: no boot step drains it, and
`bootChecks.binding.doVerify` never resolves it. It binds, and is silently never configured.

Registration now refuses it, at the point it is written:

```
[service] 'OtpSender' declares a binding with no usable namespace | namespace: '' | A key with no
leading namespace segment carries no tag, so no boot step drains it and
'bootChecks.binding.doVerify' never sees it
```

A declared `binding` is checked at import time; a `TMixinOpts.binding` at the call site is checked at
registration. Minting your own namespace still works - `BindingNamespaces.createNamespace({ name })`
- what is refused is an empty namespace, or one carrying a `.` or whitespace.

## Both injection paths, and one at a time

Constructor parameters and properties both take `target`. A call site names **either** a key or a
class - the type refuses both at once, so there is never a second answer to pick from.

```ts
class OrderController {
  constructor(
    @inject({ target: OrderService }) readonly orderService: OrderService,
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) readonly application: Application,
  ) {}
}
```

## When it refuses

A class the container was never told about fails by name rather than resolving something else:

```
[OrderController] Constructor parameter 0 names 'StrangerService', which is not registered as an
artifact | Decorate it (@service, @repository, ...) or register it on the application before it is
injected
```

A class that **is** decorated but was not registered fails the ordinary way -
`services.X is not bounded in context!` - the same message the key form gives today. If
`bootChecks.binding.doVerify` is on, both surface at boot rather than on a request.

## Not covered

**A subclass does not inherit its parent's key.** `class B extends A` where only `A` is registered
resolves nothing; `B` is a different artifact and silently borrowing `A`'s binding would be worse
than the error.

**`@provide({ key })` names a plain string** - it has no class, and is unchanged.

**The `middlewares`, `providers` and `configurations` namespaces** carry no artifact type and are
reachable only by key.

## Why not infer from the parameter type

`design:paramtypes` would remove the annotation entirely. It is not safe here: it becomes `undefined`
**with no error** when an application's tsconfig `extends` a package path under bun - measured, and
still true on bun 1.4.0. A dependency that quietly resolves to `undefined` is the one failure this
design must not add. A class reference is a value, and values do not vanish.

## Who is affected

**Every `@inject({ key })` you have written.** Nothing. The form is untouched.

**New code.** Prefer `{ target }` when the dependency is a registered class.

**You implemented your own container.** `Container.instantiate` now resolves through a protected
`resolveBindingKey`; override it if your container invents keys of its own.
