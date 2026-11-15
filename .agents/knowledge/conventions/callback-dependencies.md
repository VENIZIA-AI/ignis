---
type: Convention
title: Callback dependencies
description: A callback that runs on a request declares inject and receives injected; it never looks things up in the container.
resource: packages/kernel/src/base/controllers/factory/injection.ts
tags: [conventions, di, callbacks]
---

A function an application hands to a factory and the framework calls on every request (a scope, a settings
source, a normalizer, a response transform) never reaches into the container. The factory's options declare
the classes it needs, and each callback receives the instances in its one options object:

```typescript
SearchControllerFactory.build({
  inject: { products: ProductRepository, tenants: TenantService },
  response: { use: true, document, transform: async ({ hits, injected }) => injected.products.find({}) },
});
```

- **`inject` is `Record<string, TClass<object>>`; `injected` is `TInjected<Inject>`** (`Injection`,
  `packages/kernel/src/base/controllers/factory/injection.ts`). `Injection.register` writes the constructor
  metadata after the repository; `Injection.collect` zips the names to the instances.
- **Resolved once, at boot.** A class that is not registered fails the boot, not a request.
- **Classes only.** A key-bound or optional dependency is out of scope.
- **A subclass constructor passes every argument to `super`.** A missing instance is refused when the
  controller is built; a wrong object in its place is not caught.
- **Tests pass fakes as `injected`**: a callback is a plain function of its options.
- **`application` in a callback stays reserved for boot-time decisions**, as `TArtifactCondition` does. A
  request-time callback does not receive it.

Search controllers follow it today. The static-asset, authentication and socket callbacks do not yet: aligning
them is a separate change.

## Related

- [Options objects](/conventions/options-objects.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Typesense Search](/architecture/search-typesense.md)
