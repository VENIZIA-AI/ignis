---
title: A Component Reads Its Options In binding(), Without Overriding configure()
description: BaseComponent stores what application.component(Ctor, { options }) handed it on this.configuredOptions before binding() runs. StaticAssetComponent takes its options that way.
---

# Changelog - 2026-09-14

## A component reads its options in `binding()`

<Badge type="tip" text="Enhancement" />

**In one line.** `BaseComponent` keeps the options it was configured with on
`this.configuredOptions`, set before `binding()` runs.

```ts
class MailComponent extends BaseComponent<IMailOptions> {
  override binding() {
    const { provider } = this.configuredOptions ?? {};
  }
}

application.component(MailComponent, { options: { provider: 'amazon-ses' } });
```

Until now the options reached `configure()` and stopped there: `binding()` had no way to read them,
so every component that wanted them overrode `configure()` to stash a copy. Each one invented its
own field name.

## `StaticAssetComponent` takes its options directly

```ts
application.component(StaticAssetComponent, {
  options: {
    assets: {
      controller: { name: 'AssetController', basePath: '/assets' },
      storage: StaticAssetStorageTypes.BUN_S3,
      helper: storageHelper,
    },
  },
});
```

`StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` still works, and is still the right
answer in one case: a component registered through `configs.artifacts` gets no options, because an
artifact index carries classes and nothing else. Direct options win when both are present.

## Who is affected

**You bind `STATIC_ASSET_COMPONENT_OPTIONS`.** Nothing. The key is read whenever no options are
passed.

**You register `StaticAssetComponent` through `configs.artifacts`.** Nothing, and the key stays the
way to configure it - through a `@provide` method on a component of your own, for example.

**You write your own component.** Drop the `configure()` override that existed only to keep a copy
of the options.

**Files:**

- [`packages/kernel/src/base/components/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/components/base.ts) - `BaseComponent.configuredOptions`
- [`packages/core-server/src/components/static-asset/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/component.ts) - `StaticAssetComponent.binding`
