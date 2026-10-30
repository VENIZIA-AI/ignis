---
title: Boot Checks - Every Binding Resolves, No Hand Registration Beside the Generated Index, No Silent Key Override
description: configs.bootChecks.binding lets a boot prove that every service and repository resolves, that no hand registration sits beside the generated index, and that no two registrations silently share a key.
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-05

## Boot checks

<Badge type="tip" text="New Feature" />

**In one line.** A green boot can now prove three things it could not before: every service and repository binding resolves, an application on the generated index has no hand registration left behind, and no two registrations silently share one key.

## What changed

`bootChecks.binding` is one group of three required decisions. Without the group nothing is verified, and hand registration and same-key override stay allowed.

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

- **`doVerify: true`** adds a `verifyBindings` boot step after `postConfigure`. It resolves every binding in the `services` and `repositories` namespaces once and throws once with every broken key. Resolving builds the singletons at boot, so a constructor with a side effect runs then; turn it on where that is acceptable (development, UAT).
- **`allowManual: false`** fails the boot when `configs.artifacts` is set and `preConfigure()` or `postConfigure()` still calls `service`, `repository`, `controller`, `component` or `dataSource` by hand. Registrations made by the index step and by the framework's own steps are not affected.
- **`allowOverride: false`** makes a same-key artifact registration throw. A registration that says `allowOverride: true`, on the decorator or at the call site, still overrides. `bind()`, `set()` and `@provide` keys never pass through the guard, so a key can still be rebound at runtime.
- **`BootSteps.VERIFY_BINDINGS`** is the new step name. A server application's sequence is now 15 steps, ending `postConfigure -> verifyBindings -> validateScopeFilterSupport`.
- **`when` conditions run concurrently** inside `registerArtifacts`, so one slow async condition no longer delays the rest. Nothing changes for a synchronous condition.

## Who is affected

- **Applications adopting the generated index.** Set the group as above. Each setting names what it found: every unresolvable key, every class still registered by hand, or the first key two registrations share.
- **Code that asserts the boot sequence.** A server application logs `Boot step n/15`. A subclass that adds steps with `BootSequence.insertAfter` is unaffected.
- **Everyone else.** No action needed; without `bootChecks.binding` nothing changes.

## Details

- Reference: [Artifact registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping).
