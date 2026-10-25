---
title: A CRUD Write Route No Longer Inherits a Read-Only Authorize
description: "defineCrudController refuses to boot when create, updateById, updateBy, deleteById or deleteBy would inherit a controller-level authorize whose action is read. Anyone allowed to read could write."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-25

## A CRUD write route no longer inherits a read-only authorize

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A write route that has no `authorize` of its own used to inherit the controller-level one, so a controller-level `read` spec let anyone who may read also create, update and delete. `defineCrudController` now refuses to boot in that case.

## What was wrong

The controller-level `authorize` applies to every generated route that does not declare its own. The authorization docs showed a controller-level `{ action: read, resource }` and overrode only some write routes, so `updateById`, `updateBy` and `deleteBy` (and every write route in controllers that overrode none) were checked as `read`. A user with the `read` permission on the resource could call `POST`, `PATCH` and `DELETE`.

## Who is affected

- **Apps that followed the old docs.** A `defineCrudController` with a controller-level `authorize` whose action is `read` and at least one enabled write route without its own `authorize` now fails at boot. These apps let any reader write until now.
- **Apps whose write routes each declare an `authorize`, use `readonly`, or have a controller-level action other than `read`.** No action needed.

## The boot error

```text
[defineCrudController] Write routes would inherit a read-only authorize | controller: ArticleController | routes: ArticleController.updateById, ArticleController.updateBy | inherited: { action: read, resource: Article } | Anyone allowed to read could then create, update or delete. | Fix: declare routes.<verb>.authorize for each of them (a spec, an array or { skip: true }), or set controller.readonly, or leave them out of controller.enabledRoutes.
```

Only the action string `read` is detected. For an array, the check applies when every spec in it is `read`. A route that is not enabled, a `readonly` controller and a route with `authenticate: { skip: true }` are not checked.

## How to fix it

Give each write route its own `authorize`:

```typescript
ControllerFactory.defineCrudController({
  entity: Article,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  authorize: { action: AuthorizationActions.READ, resource: 'Article' },
  routes: {
    create: { authorize: { action: AuthorizationActions.CREATE, resource: 'Article' } },
    updateById: { authorize: { action: AuthorizationActions.UPDATE, resource: 'Article' } },
    updateBy: { authorize: { action: AuthorizationActions.UPDATE, resource: 'Article' } },
    deleteById: { authorize: { action: AuthorizationActions.DELETE, resource: 'Article' } },
    deleteBy: { authorize: { action: AuthorizationActions.DELETE, resource: 'Article' } },
  },
});
```

Or set `controller: { readonly: true }` when the controller should only read. A route that should really need only the read permission declares it explicitly: `routes.updateById.authorize: { action: AuthorizationActions.READ, resource: 'Article' }`.

The authorization guide and the controller reference now show this shape.
