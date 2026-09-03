---
type: Convention
title: Binding key namespaces
description: Every DI binding key is namespaced by artifact kind - controllers.X, services.X, and so on.
resource: packages/kernel/src/common/bindings.ts
tags: [conventions, di, bindings]
---

Every binding key registered in the container is namespaced by the kind of artifact it names.
`BindingNamespaces` in `packages/kernel/src/common/bindings.ts` defines the namespace constants as a
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
}
```

A binding key is namespace + `.` + class name: `controllers.UserController`,
`services.AuthService`, `repositories.UserRepository`, `datasources.PostgresDataSource`,
`components.HealthComponent`. This is what the five registration methods and `registerArtifacts` derive
when a class declares no `binding`, and what `@inject({ key })` targets when a dependency needs an
explicit key rather than relying on auto-injection.

**Keys stay with their owner.** A component's binding-key const class lives in that component's own
`common/` (`HealthCheckBindingKeys`, `AuthenticateBindingKeys`, `AuthorizeBindingKeys`), an
application's in its own `common/keys.ts`; there is no repo-wide key file to keep in sync. The
repo-wide view is the generated catalog below, produced by `make okf-gen`.

`CoreBindings` in the same file is the other binding class: fixed, non-namespaced keys for
fundamental framework singletons (`@app/instance`, `@app/server`, `@app/config`, and so on) rather
than per-artifact bindings.

Both classes used to live in `packages/core-server`, which still re-exports them from
`@venizia/ignis-kernel` - importing either from `core` keeps working, but the kernel is where they
are defined.

The full generated list of every key currently registered lives at
[binding keys](/reference/binding-keys.md).

## Related

- [Const classes](/conventions/const-classes.md)
- [DI container](/architecture/di-container.md)
- [Binding keys reference](/reference/binding-keys.md)
- [Artifact registration](/architecture/boot-lifecycle.md)
