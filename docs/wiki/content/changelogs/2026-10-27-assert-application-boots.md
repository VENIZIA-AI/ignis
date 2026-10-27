---
title: assertApplicationBoots Proves an Application Boots Without Infrastructure
description: "New in @venizia/ignis/testing: assertApplicationBoots runs an application's own boot with datasources and secrets skipped and fails with the error boot raises. New apps get src/boot.test.ts; an existing app can add it."
packages: ['@venizia/ignis', '@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-27

## assertApplicationBoots proves an application boots without infrastructure

<Badge type="tip" text="New Feature" />

**In one line.** A test can now run an application's real boot with no database, port or network, and fails with the error boot raises. New apps get it as `src/boot.test.ts`; an existing app can add it. Ships in 0.4.4.

## What changed

- **`assertApplicationBoots(application | () => application, options?)`** in `@venizia/ignis/testing` (not in the root barrel). It runs `init()` and `initialize()`, never `start()`, so no socket opens and no post-start hook runs.
- **Datasources are skipped, components run.** Every datasource is bound and resolved but its `configure()` does not run unless you name it in `keepDataSources`. A component runs unless you name it in `skipComponents`. `hydrateSecrets` and `wireSecretRotatables` are skipped by default, so a secrets provider is never contacted; `skipSteps` replaces that default.
- **It fails the way boot fails.** An unregistered injection rejects with `Binding key: services.X is not bounded in context!`. `verifyBindings` is on by default, so an injection nobody references at boot fails too. An application with no controller is rejected.
- **A duplicate-route check of its own.** IGNIS boot raises no error when two controllers mount the same method and path. The helper does, naming both controllers; `routes: false` turns it off.
- **One shared check in `@venizia/ignis-inversion`.** `verifyBindings` and `assertBindingsResolve` resolve every binding of the namespaces you name and report what is missing and who needs it. The helper and the kernel's `verifyBindings` boot step (`bootChecks.binding.doVerify`) both call it, so both throw the same error: `[verifyBindings] N binding(s) cannot be resolved | <key>: <message>`, with `extra.missing` mapping each missing key to the bindings that need it. The message text is unchanged; `extra` is new. `Container.get` now also sets `extra.unboundKey` on its "not bounded" error.
- **`skipBindings`.** The helper takes a list of services or repositories the verification leaves out; a name that matches nothing rejects.
- **The `ignis` preset ships `src/boot.test.ts`.** `make preset-smoke` runs it in the generated app.

## Who is affected

Nobody has to change anything. The verification now runs after the last boot step of a helper run, so when `validateScopeFilterSupport` also fails, its error comes first. New apps created from the preset have the test from the start. To add it to an existing app, copy the test from [Prove the Application Boots](/guides/tutorials/testing#prove-the-application-boots) into `src/boot.test.ts`; it needs your application exported from `src/application.ts`.

What it does not prove: a wrong database URL or password, a migration, anything `start()` does, or code of your own that opens a connection while it boots.
