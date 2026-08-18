---
title: Every Browser-Safe Package Now Ships ESM
description: The packages that claim browser purity publish a real ESM build, so a bundler needs no workarounds - plus one shared default middleware stack and one request-id rule for both hosts.
---

# Changelog - 2026-08-18

## ESM builds, one default middleware stack, one request-id rule

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every IGNIS package a browser can use now publishes real ESM alongside CommonJS, and
the pieces a server and a browser Worker both need are written once instead of twice.

## What changed

- **ESM builds.** `@venizia/ignis-kernel`, `@venizia/ignis-core-worker`,
  `@venizia/ignis-connectors` and `@venizia/ignis-helpers` publish `import` and `require` conditions,
  joining `@venizia/ignis-inversion` and `@venizia/ignis-filter`. A bundler resolves real ESM instead
  of falling back to CommonJS.
- **A browser app needs no bundler workarounds.** The `examples/browser-bff` Vite config used to name
  every IGNIS sub-path in `optimizeDeps.include` by hand and shim `__filename` for Rolldown. Both are
  gone, and its page chunk fell from 682 KB to 54 KB.
- **One default middleware stack.** The request id, the framework error handler and the JSON 404 are
  installed by `RestApplication.registerDefaultMiddlewares()`. A server adds its own on top; a
  browser Worker inherits the three unchanged.
- **One request-id rule.** Both ends of a request now stamp the same format. The server used to take
  hono's `crypto.randomUUID` default while a Worker used a Snowflake id, so the two halves of one
  request disagreed.
- **A migration runner for engines Drizzle's own cannot reach.** `RelationalMigrationRunner` applies
  each migration and its ledger row in a single transaction, splitting on `drizzle-kit`'s
  `--> statement-breakpoint`. Written for embedded engines like PGlite, where the file-system
  migrator does not exist.
- **The error middleware takes options, not subclass hooks.** `environment` and `formatError` are
  constructor options on `BaseAppErrorMiddleware`. An application with no ambient environment - a
  browser Worker - declares one through `config.error.environment`.
- **Faster boot and queries.** Registering artifacts no longer re-scans the binding map once per
  item (3.50 ms to 0.043 ms at 200 controllers), and an included relation asks the model registry
  once per query instead of three times.

## Who is affected

- **Applications on `@venizia/ignis`.** No action needed. Import specifiers are unchanged, and
  `IApplicationConfigs` still carries `host` and `port`.
- **Applications bundling IGNIS for a browser.** You can delete `optimizeDeps.include` entries and
  any `__filename` shim you added for IGNIS packages.
- **Anyone importing a deep `dist/...` path.** The built output moved to `dist/cjs` and `dist/esm`.
  Import through the package name or a published sub-path instead - deep paths were never a supported
  entry point.
- **Anyone who wrote a custom relational driver.** `IRelationalConnection` gained `query()`. See
  below.
- **Anyone who subclassed `BaseAppErrorMiddleware`.** The two `protected` hooks became options. See
  below.

## Breaking changes

> [!WARNING]
> Two internal seams changed shape. Both are `protected`/contract-level surfaces with no known
> external users; ordinary applications are unaffected.

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

`AppErrorMiddleware` from `@venizia/ignis` is unchanged for callers - it now supplies those two
options for you.

## Notes

`RequestTrackerComponent` no longer installs `requestId()` itself; the application's default stack
installs it first. If you configure that component by hand, outside
`registerDefaultMiddlewares()`, install `requestId()` yourself or call the default stack.
