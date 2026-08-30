---
title: "authorize() Denies When No Enforcer Is Registered, Instead of Allowing Everything"
description: "A route with authorize() declared but zero enforcers registered used to allow every request. It now denies, honoring defaultDecision like every other inconclusive check in the pipeline."
---

# Changelog - 2026-08-30

## `authorize()` Denies When No Enforcer Is Registered

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A route with `authorize()` declared but no enforcer registered used to allow every request; it now denies, unless `defaultDecision: 'allow'` says otherwise.

## The problem it solves

`AuthorizationProvider`'s request pipeline has one job at each step: decide `ALLOW`, `DENY`, or fail closed. Every step already did that - except one. When `AuthorizationEnforcerRegistry.hasEnforcers()` was `false`, the middleware called `next()` unconditionally, regardless of what the application had configured.

That made a misconfiguration indistinguishable from an intentional bypass. An application that declared `authorize()` on a route but forgot to register an enforcer - a common state mid-rollout - let every request through with no error, no denial, and only a `debug`-level log line that most deployments never see.

`IAuthorizeOptions.defaultDecision` already exists for exactly this kind of inconclusive outcome - it is what an `ABSTAIN` decision falls back to further down the same function. The no-enforcer branch never read it.

## What changed

- **No enforcers registered now denies by default.** `defaultDecision` unset, or explicitly `'deny'`, throws a new `ENFORCER_NOT_REGISTERED` error (403) naming the actual cause - `authorize()` was declared for this route but no enforcer is registered - instead of a generic denial.
- **`defaultDecision: 'allow'` still proceeds**, but now logs at `warn` instead of `debug`, so an application running with authorization declared and nothing enforcing it can see that in its logs without turning diagnostics up.
- **Every earlier short-circuit is unchanged.** `alwaysAllowRoles`, `spec.allowedRoles`, and the voter chain all still run before this check and can still grant access on their own, exactly as before.

## Who is affected

- **Anyone who registers enforcers before serving traffic.** No action needed - `hasEnforcers()` is `true`, so this branch never runs.
- **Anyone relying on the old fail-open behavior during a rollout** (routes with `authorize()` declared ahead of enforcer registration). These routes now deny with a 403 instead of allowing. Set `defaultDecision: 'allow'` to restore the old behavior deliberately - and expect a warning per request until an enforcer is registered.
- **Anyone who never set `defaultDecision` at all.** It now matters for this branch too, not just for `ABSTAIN`. The default remains `'deny'`.

## Breaking changes

> [!WARNING]
> A route with `authorize()` declared and no enforcer registered now returns 403 instead of succeeding.

**Migration:** if you need the old behavior while enforcers are still being wired up, set it explicitly:

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'allow', // restores the old no-enforcer behavior, now with a warning per request
});
```

## Details

- New error: `AuthorizationErrors.ENFORCER_NOT_REGISTERED` (`core.authorization.enforcer_not_registered`, 403) in `common/errors.ts`. `DENIED` and `DENIED_BY_VOTER` both describe an enforcer or voter actively refusing; this one names the different cause - no enforcer ran at all.
- The fix is isolated to the no-enforcer branch in `createAuthorizeMiddleware` - the enforcer-registered path (build rules, evaluate, `ABSTAIN` -> `defaultDecision`) is untouched.

| File | Package |
|------|---------|
| `packages/kernel/src/base/auth/authorize/providers/authorization.provider.ts` | kernel |
| `packages/kernel/src/base/auth/authorize/common/errors.ts` | kernel |

## See also

- [Authorization - Setup & Configuration](/extensions/components/authorization/) - `defaultDecision` and other `IAuthorizeOptions`
- [Authorization - Error Reference](/extensions/components/authorization/errors) - full error table and troubleshooting
