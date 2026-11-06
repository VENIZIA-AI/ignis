---
title: ApplicationBootAssertion resets the enforcer registry, so a second boot in one process works
description: "ApplicationBootAssertion.assert resets the process-wide AuthorizationEnforcerRegistry before it boots, so booting an application twice in one process no longer fails with Enforcer already registered."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-06

## ApplicationBootAssertion resets the enforcer registry, so a second boot in one process works

<Badge type="info" text="Bug Fix" />

**In one line.** Two `ApplicationBootAssertion.assert` calls in one process, such as two tests or a boot test followed by another, no longer fail with `[AuthorizationEnforcerRegistry] Enforcer already registered: casbin`, and no `reset()` is needed between them.

## What changed

- **The helper resets the registry.** `ApplicationBootAssertion.assert` calls `AuthorizationEnforcerRegistry.getInstance().reset()` before it boots. The registry is process-wide, so a name registered by an earlier boot in the same process used to collide.
- **`register()` stays strict.** An application that registers the same enforcer name twice still gets `Enforcer already registered`. Two applications alive in one process also still collide, on purpose: the authorization middleware reads the registry at request time, so a second registration would otherwise answer the first application's requests.

## Who is affected

- **Tests that boot an application more than once with `ApplicationBootAssertion.assert`.** They can drop the `reset()` between boots.
- **A process that serves an application and also runs the helper.** The served application loses its enforcers and authorize options, so its requests fall back to the no-enforcer default (deny unless configured otherwise). Run the helper in a test process.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/testing/assert-application-boots.ts` | core-server |
