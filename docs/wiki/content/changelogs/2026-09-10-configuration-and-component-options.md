---
title: Application Configurations and Type-Safe Component Options
description: Introduces @configuration with topological dependency ordering, and type-safe options pass-through in application.component() and application.dataSource().
---

# Changelog - 2026-09-10

## `@configuration` class artifact and type-safe component options

<Badge type="tip" text="Feature" />

Two related capabilities for application startup:

1. **`@configuration` class artifact:** Runs before datasources and components, can use `@provide` to supply configuration values for other artifacts, and orders deterministically via topological sorting of declared dependencies (`after: [ConfigA]`).
2. **Type-safe component options:** `application.component(ComponentClass, { options })` accepts typed options validated against the component's generic options parameter and passes them directly to `instance.configure(options)` during initialization.

---

### 1. `@configuration` with topological ordering

```ts
import { BaseConfiguration, configuration, provide } from '@venizia/ignis-kernel';

@configuration()
export class DatabaseConfiguration extends BaseConfiguration {
  @provide({ key: 'configurations.dbUrl' })
  dbUrl(): string {
    return process.env.DATABASE_URL!;
  }
}

@configuration({ after: [DatabaseConfiguration] })
export class CacheConfiguration extends BaseConfiguration {
  override setup(): void {
    // Guaranteed to execute after DatabaseConfiguration
  }
}
```

- **Topological sort:** Sibling configurations without explicit dependencies run deterministically sorted by class name (`localeCompare`).
- **Cycle detection:** Circular dependencies (`A -> B -> A`) throw immediately at boot with `[sortConfigurationsTopologically] Dependency cycle detected in configurations: ...`.
- **Boot order:** Configurations run at `REGISTER_CONFIGURATIONS`, **before** `REGISTER_DATA_SOURCES` and `REGISTER_COMPONENTS`, so provided configuration values are available when datasources and components boot.

---

### 2. Options passed at registration

```ts
application.component(MailComponent, {
  options: {
    provider: 'amazon-ses',
    config: { region: 'ap-southeast-1' },
  },
});
```

- `TMixinOpts` gains `options?: Options`.
- `application.component<Base, Options>()` and `application.dataSource<Base, Options>()` type-check `options` against the class's `ConfigurableOptions` generic.
- `registerDynamicBindings` passes the options map entry to `instance.configure(options)`.
