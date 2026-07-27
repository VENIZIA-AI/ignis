---
type: Convention
title: Binding key namespaces
description: Every DI binding key is namespaced by artifact kind - controllers.X, services.X, and so on.
resource: packages/core/src/common/bindings.ts
tags: [conventions, di, bindings]
---

Every binding key registered in the container is namespaced by the kind of artifact it names.
`BindingNamespaces` in `packages/core/src/common/bindings.ts` defines the namespace constants as a
[const class](/conventions/const-classes.md):

```typescript
export class BindingNamespaces {
  static readonly COMPONENT = BindingNamespaces.createNamespace({ name: 'components' });
  static readonly DATASOURCE = BindingNamespaces.createNamespace({ name: 'datasources' });
  static readonly REPOSITORY = BindingNamespaces.createNamespace({ name: 'repositories' });
  static readonly MODEL = BindingNamespaces.createNamespace({ name: 'models' });
  static readonly SERVICE = BindingNamespaces.createNamespace({ name: 'services' });
  static readonly MIDDLEWARE = BindingNamespaces.createNamespace({ name: 'middlewares' });
  static readonly PROVIDER = BindingNamespaces.createNamespace({ name: 'providers' });
  static readonly CONTROLLER = BindingNamespaces.createNamespace({ name: 'controllers' });
  static readonly BOOTERS = BindingNamespaces.createNamespace({ name: 'booters' });
}
```

A binding key is namespace + `.` + class name: `controllers.UserController`,
`services.AuthService`, `repositories.UserRepository`, `datasources.PostgresDataSource`,
`components.HealthComponent`. This is what the auto-discovery booters use to register artifacts
they find during boot, and what `@inject({ key })` targets when a dependency needs an explicit key
rather than relying on auto-injection.

`CoreBindings` in the same file is the other binding class: fixed, non-namespaced keys for
fundamental framework singletons (`@app/instance`, `@app/server`, `@app/config`, and so on) rather
than per-artifact bindings.

The full generated list of every key currently registered lives at
[binding keys](/reference/binding-keys.md).

## Related

- [Const classes](/conventions/const-classes.md)
- [DI container](/architecture/di-container.md)
- [Binding keys reference](/reference/binding-keys.md)
- [Boot lifecycle](/architecture/boot-lifecycle.md)
