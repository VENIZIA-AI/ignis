---
title: "authorize() Denies When No Enforcer Is Registered, Instead of Allowing Everything"
description: "A route with authorize() declared but no enforcer registered used to allow every request; it now denies, honoring defaultDecision."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-08-30

## `authorize()` Denies When No Enforcer Is Registered

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A route with `authorize()` declared but no enforcer registered used to allow every request; it now denies, unless `defaultDecision: 'allow'` says otherwise.

## What changed

- **No enforcers registered now denies by default.** With `defaultDecision` unset or `'deny'`, the request fails with a new `ENFORCER_NOT_REGISTERED` error (403, `core.authorization.enforcer_not_registered`) that names the cause.
- **`defaultDecision: 'allow'` still proceeds,** but now logs at `warn` instead of `debug`.
- **Earlier checks are unchanged.** `alwaysAllowRoles`, `spec.allowedRoles`, and the voter chain still run first and can still grant access.

## Who is affected

- **Anyone who registers enforcers before serving traffic.** No action needed.
- **Anyone relying on the old fail-open behavior during a rollout** (routes with `authorize()` declared ahead of enforcer registration). These routes now return 403.
- **Anyone who never set `defaultDecision`.** It now matters here too, not just for `ABSTAIN`. The default remains `'deny'`.

## Breaking changes

> [!WARNING]
> A route with `authorize()` declared and no enforcer registered now returns 403 instead of succeeding.

**Migration:** if you need the old behavior while enforcers are being wired up, set it explicitly. Expect a warning per request until an enforcer is registered.

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: 'allow', // restores the old no-enforcer behavior, now with a warning per request
});
```

## See also

- [Authorization - Setup & Configuration](/extensions/components/authorization/) - `defaultDecision` and other `IAuthorizeOptions`
- [Authorization - Error Reference](/extensions/components/authorization/errors) - full error table and troubleshooting
