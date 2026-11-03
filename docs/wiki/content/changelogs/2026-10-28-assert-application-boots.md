---
title: assertApplicationBoots Proves an Application Boots Without Infrastructure
description: "A test can run an application's real boot with no database, port or network using assertApplicationBoots from @venizia/ignis/testing, and it fails with the error boot raises."
packages: ['@venizia/ignis', '@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-28

## assertApplicationBoots proves an application boots without infrastructure

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A test can run an application's real boot with no database, port or network, and fails with the error boot raises. New apps get it as `src/boot.test.ts`; an existing app can add it. Ships in 0.4.4, with two fixes in 0.4.5.

## What changed

- **`assertApplicationBoots(application | () => application, options?)`** in `@venizia/ignis/testing` (not in the root barrel). It runs `init()` and `initialize()`, never `start()`, so no socket opens and no post-start hook runs.
- **Datasources are skipped, components run.** Every datasource is bound and resolved but its `configure()` does not run unless you name it in `keepDataSources`. A component runs unless you name it in `skipComponents`. `hydrateSecrets` and `wireSecretRotatables` are skipped by default, so a secrets provider is never contacted; `skipSteps` replaces that default.
- **It fails the way boot fails.** An unregistered injection rejects with `Binding key: services.X is not bounded in context!`. `verifyBindings` is on by default, so an injection nobody references at boot fails too. An application with no controller is rejected.
- **A duplicate-route check of its own.** IGNIS boot raises no error when two controllers mount the same method and path. The helper does, naming both controllers; `routes: false` turns it off.
- **`skipBindings`.** The helper takes a list of services or repositories the verification leaves out; a name that matches nothing rejects.
- **One shared check in `@venizia/ignis-inversion`.** `verifyBindings` and `assertBindingsResolve` resolve every binding of the namespaces you name and report what is missing and who needs it. The kernel's `verifyBindings` boot step (`bootChecks.binding.doVerify`) uses the same check, so both throw `[verifyBindings] N binding(s) cannot be resolved | <key>: <message>`, with `extra.missing` mapping each missing key to the bindings that need it. The message text is unchanged; `extra` is new. `Container.get` now also sets `extra.unboundKey` on its "not bounded" error.
- **Fixed in 0.4.5: no false duplicates.** A route with an authenticate step, an authorize step or a validator was reported as mounted more than once. A controller now counts once per method and path. A real duplicate is still reported: two different controllers on the same method and path, or one controller that declares the same method and path twice through decorators (the message then says `(declared 2 times)`). Not detected: a method and path a controller declares twice inside `binding()`.
- **New in 0.4.5: a hint when a component fails.** When the boot rejects while a component's `configure()` is running (for example one that opens Redis, Kafka or S3), the helper logs one warning naming it: `skipComponents: ['Name']` skips it, and `skipBindings` lists the services that depend on it. The rejection is never wrapped.

## Who is affected

- **Everyone.** Nobody has to change anything. The verification now runs after the last boot step of a helper run, so when `validateScopeFilterSupport` also fails, its error comes first.
- **New apps from the `ignis` preset** have the test from the start. To add it to an existing app, copy the test from [Prove the Application Boots](/guides/tutorials/testing#prove-the-application-boots) into `src/boot.test.ts`; it needs your application exported from `src/application.ts`.
- **A test that passed `{ routes: false }` only to get past the false duplicate report.** On 0.4.5 you can drop the option.

## Details

What it does not prove: a wrong database URL or password, a migration, anything `start()` does, or code of your own that opens a connection while it boots.
