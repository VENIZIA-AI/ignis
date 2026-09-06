---
title: CRUD Controllers Narrow Their Rows; The Asset Controller Takes Two Hooks
description: ReadableCrudController gains getBaseWhere, a per-controller scope that every read verb ANDs into the request filter. AssetControllerFactory gains resolveObjectName and defineExtraRoutes, so an application renames an upload or adds a route without copying the 450-line factory. Both default to today's behaviour.
---

# Changelog - 2026-09-07

## A CRUD controller narrows its own rows

<Badge type="tip" text="New Feature" />

**In one line.** Override `getBaseWhere` once and every read of that controller is scoped, header and all.

```typescript
class OrderController extends ControllerFactory.defineCrudController({ ... }) {
  override async getBaseWhere(opts: { context: TRouteContext }) {
    const tenantId = opts.context.req.header('x-tenant-id');
    return tenantId ? { tenantId } : undefined;
  }
}
```

### The problem it solves

Scoping rows to a tenant meant overriding `find` and `count`. Each override copied the framework body, ANDed the scope into `filter.where` and rebuilt `Content-Range` by hand. The copy froze at the framework version of its day. `findOne` and `findById` were usually forgotten.

### What changed

| Symbol | Change | Package |
|---|---|---|
| `ReadableCrudController.getBaseWhere({ context })` | New. Returns `undefined` by default | kernel |

Each read verb combines the two sides as <code v-pre>{ and: [baseWhere, requestWhere] }</code>. A request without its own `where` gets the base where alone.

| Verb | How the base where is applied |
|---|---|
| `count` | ANDed into the request `where` |
| `find` | ANDed into `filter.where` |
| `findOne` | ANDed into `filter.where` |
| `findById` | ANDed with `{ id }`, and the read goes through `repository.findOne` |

`findById` takes the detour because `repository.findById` accepts no `where`. An id outside the scope answers the same body as an id that does not exist: `{ count: 0, data: null }`. It never returns another tenant's row.

The method is public, not protected. A generated controller's declaration file cannot carry a protected member (TypeScript error TS4094).

### Who is affected

- **Controllers that override `find` or `count` only to narrow rows.** Delete the override and return the scope from `getBaseWhere`.
- **Everyone else.** No action needed. Without an override every verb passes the request filter through untouched.

## The static-asset controller takes two hooks

<Badge type="tip" text="New Feature" />

**In one line.** Rename an upload or add a route without copying `AssetControllerFactory.defineAssetController`.

```typescript
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  staticAsset: {
    controller: { name: 'AssetController', basePath: '/assets' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './app_data/assets' }),
    resolveObjectName: ({ originalName, defaultName }) => {
      return originalName.startsWith('invoice-') ? originalName : defaultName;
    },
  },
});
```

### The problem it solves

Keeping one uploaded file's original name, or adding a route beside the built-in ones, had no seam. One consumer duplicated all 456 lines of the factory to change a name and add two routes.

### What changed

| Symbol | Change | Package |
|---|---|---|
| `IAssetControllerOptions.resolveObjectName` | New. Decides the stored object name | core-server |
| `IAssetControllerOptions.defineExtraRoutes` | New. Registers your routes after the built-in ones | core-server |
| `TStaticAssetsComponentOptions[key]` | Both hooks pass through the component config too | core-server |

- `resolveObjectName` is offered `{ originalName, defaultName, bucket }`. `defaultName` is the name IGNIS would have written; return it and nothing changes.
- The returned name is still validated with `isValidPath()`, so a traversal cannot leave the bucket.
- `defineExtraRoutes` is offered `{ controller, helper, basePath }` and runs last, so a built-in route wins a path collision.

### Who is affected

- **Applications that copied the asset controller factory.** Delete the copy and set the hooks.
- **Everyone else.** No action needed. Both hooks are optional and unset means today's behaviour.

## Details

- Reference: [Controllers](/references/base/controllers), [Static Asset Component](/extensions/components/static-asset/api).
