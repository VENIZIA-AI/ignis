---
title: Application Configurations and Type-Safe Component Options
description: You can declare ordered @configuration classes that run before datasources and components, and pass typed options to application.component() and application.dataSource().
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-10

## `@configuration` class artifact and type-safe component options

<Badge type="tip" text="Feature" />

**In one line.** Configuration classes run first and in a deterministic order, and component options are type-checked at registration.

## What changed

- **`@configuration`.** A class extending `BaseConfiguration` runs before datasources and components, and can use `@provide` to supply values for other artifacts.
- **Ordering.** Declare dependencies with `after: [ConfigA]`. Siblings without dependencies run sorted by class name. A cycle throws at boot with `Dependency cycle detected in configurations: ...`.
- **Boot order.** Configurations run at `REGISTER_CONFIGURATIONS`, before `REGISTER_DATA_SOURCES` and `REGISTER_COMPONENTS`.
- **Typed options.** `application.component<Base, Options>()` and `application.dataSource<Base, Options>()` type-check `options` against the class's `ConfigurableOptions` generic and pass them to `instance.configure(options)`. `TMixinOpts` gains `options?: Options`.

```ts
@configuration({ after: [DatabaseConfiguration] })
export class CacheConfiguration extends BaseConfiguration {
  override setup(): void {
    // Guaranteed to execute after DatabaseConfiguration
  }
}

application.component(MailComponent, {
  options: { provider: 'amazon-ses', config: { region: 'ap-southeast-1' } },
});
```

## Who is affected

- **Everyone.** Additive. No action needed.
