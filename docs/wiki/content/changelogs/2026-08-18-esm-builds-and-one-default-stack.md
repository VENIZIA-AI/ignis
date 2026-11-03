---
title: Every Browser-Safe Package Now Ships ESM
description: Every IGNIS package a browser can use now publishes real ESM, so a bundler needs no workarounds, and the server and browser Worker share one default middleware stack and one request-id rule.
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-worker', '@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-18

## ESM builds, one default middleware stack, one request-id rule

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every IGNIS package a browser can use now publishes real ESM alongside CommonJS, and the pieces a server and a browser Worker both need are written once.

## What changed

- **ESM builds.** `@venizia/ignis-kernel`, `@venizia/ignis-core-worker`, `@venizia/ignis-connectors` and `@venizia/ignis-helpers` publish `import` and `require` conditions, joining `@venizia/ignis-inversion` and `@venizia/ignis-filter`.
- **No bundler workarounds in a browser app.** You no longer need to name IGNIS sub-paths in `optimizeDeps.include` or shim `__filename` for Rolldown.
- **One default middleware stack.** The request id, the framework error handler and the JSON 404 are installed by `RestApplication.registerDefaultMiddlewares()`. A server adds its own on top; a browser Worker inherits the three.
- **One request-id rule.** The server and a Worker now stamp the same format. Before, the server used `crypto.randomUUID` and a Worker used a Snowflake id.
- **`RelationalMigrationRunner`** applies each migration and its ledger row in one transaction, splitting on `drizzle-kit`'s `--> statement-breakpoint`. It is for embedded engines like PGlite, where the file-system migrator does not exist.
- **The error middleware takes options.** `environment` and `formatError` are constructor options on `BaseAppErrorMiddleware`. An app with no ambient environment, such as a browser Worker, declares one through `config.error.environment`.
- **Faster boot and queries.** Registering artifacts no longer re-scans the binding map once per item, and an included relation asks the model registry once per query instead of three times.

## Who is affected

- **Applications on `@venizia/ignis`.** No action needed. Import specifiers are unchanged.
- **Applications bundling IGNIS for a browser.** You can delete the `optimizeDeps.include` entries and any `__filename` shim you added for IGNIS packages.
- **Anyone importing a deep `dist/...` path.** The built output moved to `dist/cjs` and `dist/esm`. Import through the package name or a published sub-path instead.
- **Anyone who wrote a custom relational driver** or subclassed `BaseAppErrorMiddleware`. See Breaking changes.

## Breaking changes

> [!WARNING]
> Two internal seams changed shape. Both are `protected` or contract-level surfaces with no known external users; ordinary applications are unaffected.

**A custom relational driver must implement `query()`:**

```typescript
// Before
acquire: async () => ({
  connector,
  execute: async ({ statement }) => ({ count: 0 }),
  release: () => {},
});

// After - `query()` returns rows for a verbatim statement
acquire: async () => ({
  connector,
  execute: async ({ statement }) => ({ count: 0 }),
  query: async ({ statement }) => [],
  release: () => {},
});
```

**A subclass of `BaseAppErrorMiddleware` passes options instead of overriding hooks:**

```typescript
// Before
class MyErrorMiddleware extends BaseAppErrorMiddleware {
  protected override resolveEnvironment() {
    return process.env.NODE_ENV;
  }
  protected override hasAmbientEnvironment() {
    return true;
  }
}

// After - the option's PRESENCE is what says this host has an environment at all
new BaseAppErrorMiddleware({ environment: () => process.env.NODE_ENV });
```

`AppErrorMiddleware` from `@venizia/ignis` is unchanged for callers.

## Details

`RequestTrackerComponent` no longer installs `requestId()` itself; the application's default stack installs it first. If you configure that component by hand, outside `registerDefaultMiddlewares()`, install `requestId()` yourself or call the default stack.
