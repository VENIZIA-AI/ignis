---
title: A Component Reads Its Options In binding(), Without Overriding configure()
description: BaseComponent stores the options from application.component(Ctor, { options }) on this.configuredOptions before binding() runs, and StaticAssetComponent takes its options that way.
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-14

## A component reads its options in `binding()`

<Badge type="tip" text="Enhancement" />

**In one line.** `BaseComponent` keeps the options it was configured with on `this.configuredOptions`, set before `binding()` runs.

```ts
class MailComponent extends BaseComponent<IMailOptions> {
  override binding() {
    const { provider } = this.configuredOptions ?? {};
  }
}

application.component(MailComponent, { options: { provider: 'amazon-ses' } });
```

## What changed

- **No `configure()` override.** Options used to reach `configure()` and stop, so every component overrode it to stash a copy.
- **`StaticAssetComponent` takes options directly.** Pass `options: { assets: { controller, storage, helper } }` to `application.component(StaticAssetComponent, ...)`. Direct options win when both are present.
- **The binding key still works.** `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` is read whenever no options are passed. It stays the way to configure a component registered through `configs.artifacts`, which gets no options.

## Who is affected

- **You bind `STATIC_ASSET_COMPONENT_OPTIONS`.** Nothing.
- **You register `StaticAssetComponent` through `configs.artifacts`.** Nothing. The key stays the way to configure it.
- **You write your own component.** Drop the `configure()` override that existed only to keep a copy of the options.
