---
title: Boot Checks - Every Binding Resolves, No Hand Registration Beside the Generated Index, No Silent Key Override
description: configs.bootChecks.binding holds three decisions - doVerify adds a verifyBindings boot step that resolves every service and repository once and fails the boot with the full list of broken keys, allowManual false rejects a hand registration inside preConfigure or postConfigure while configs.artifacts is set, and allowOverride false makes a same-key artifact registration throw.
---

# Changelog - 2026-09-05

## Boot checks

<Badge type="tip" text="New Feature" />

**In one line.** A green boot now can prove three things it could not before: every service and repository binding resolves, an application that moved to the generated index has no hand registration left behind, and no two registrations silently share one key.

```typescript
export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: GeneratedArtifacts,
  bootChecks: {
    binding: {
      doVerify: process.env.NODE_ENV !== 'production',
      allowManual: false,
      allowOverride: false,
    },
  },
};
```

## The problem it solves

A container resolves lazily. A made-up `@inject` key, or a dependency a `when` condition excluded, compiles, passes the unit tests and boots; it fails at the first `get`, which is usually inside a real request. And an application half-way through adopting `configs.artifacts` keeps working while a forgotten `this.service(...)` in `preConfigure()` runs after the index step and silently overrides what the index registered. And with hundreds of classes across many indexes, two classes that share one `binding` key - a run-mode pair whose `when` conditions overlap, or a copy-pasted key - register without a sound, and the last one wins.

## What changed

`bootChecks.binding` is one group of three required decisions. Without the group nothing is verified, and hand registration and same-key override stay allowed - the behavior before this release.

- **`doVerify: true`** adds the boot step `verifyBindings` after `postConfigure`. It resolves every binding in the `services` and `repositories` namespaces once, collects every failure, and throws once: `[verifyBindings] 2 binding(s) cannot be resolved | services.ReportService: Binding key: repositories.Missing is not bounded in context! | ...`. Resolving builds the singletons at boot, so a constructor with a side effect runs then; turn it on where that is acceptable (development, UAT).
- **`allowManual: false`** fails the boot when `configs.artifacts` is set and `preConfigure()` or `postConfigure()` still calls `service`, `repository`, `controller`, `component` or `dataSource` by hand: `[service] 'PricingService' is registered by hand inside preConfigure() while 'configs.artifacts' is set and 'bootChecks.binding.allowManual' is false ...`. Registrations made by the index step itself and by the framework's own steps are not affected.
- **`allowOverride: false`** makes every artifact registration behave as if it said `allowOverride: false`: a key that is already bound throws `[service] Binding key already registered: 'services.RunModeService' | 'bootChecks.binding.allowOverride' is false ...`. A registration that says `allowOverride: true`, on the decorator or at the call site, still overrides. `bind()`, `set()` and `@provide` keys never pass through the guard, so a key can still be rebound at runtime.
- **`BootSteps.VERIFY_BINDINGS`** is the new kernel step name; a server application's sequence is now 15 steps, ending `postConfigure -> verifyBindings -> validateScopeFilterSupport`.
- **`when` conditions run concurrently** inside `registerArtifacts`: the conditions of one kind are evaluated together instead of awaited one by one, so one slow async condition no longer delays the rest. Nothing changes for a synchronous condition.

## Who is affected

- **Applications adopting the generated index.** Set the group as above in the migration branch: `doVerify` names every unresolvable key in one message, `allowManual: false` names every class still registered by hand, `allowOverride: false` names the first key two registrations share. No action needed otherwise.
- **Code that asserts the boot sequence.** A server application logs `Boot step n/15`; a subclass that splices its own steps with `BootSequence.insertAfter` is unaffected.
- **Everyone else.** No action needed; without `bootChecks.binding` nothing changes.

## Details

| Symbol | Change | Package |
|---|---|---|
| `IApplicationConfigs.bootChecks` | New: `{ binding?: { doVerify: boolean; allowManual: boolean; allowOverride: boolean } }` | kernel |
| `BootSteps.VERIFY_BINDINGS` | New step, after `POST_CONFIGURE` | kernel |
| `RestApplication.verifyBindings()` | New protected step body | kernel |
| `RestApplication.assertNoBindingCollision()` | `allowOverride` defaults to `bootChecks.binding.allowOverride` (`true` when the group is absent); the message names the setting when it is the reason | kernel |

- Reference: [Artifact registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping).
