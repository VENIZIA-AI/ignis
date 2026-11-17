---
title: A statuses subpath, and status checks that read the code
description: "@venizia/ignis-kernel/statuses exports Statuses and CommonStatuses alone; the Statuses category checks read the leading digit of a code, and isValid checks its shape instead of the built-in list."
packages: ['@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-11-08

## A statuses subpath, and status checks that read the code

<Badge type="warning" text="Behaviour change" />

**In one line.** A browser bundle can import `Statuses` and `CommonStatuses` from `@venizia/ignis-kernel/statuses`, and an app can add its own status codes by extending `Statuses`.

## What changed

- **A new entry, `@venizia/ignis-kernel/statuses`.** It exports `Statuses` and `CommonStatuses` and imports nothing else. The root export is unchanged.
- **The category checks read the leading digit.** `isInitial`, `isPending`, `isActive`, `isCompleted`, `isInactive` and `isFailed` are true for a code that starts with `0`, `1`, `2`, `3`, `4` and `5`. A code an app adds is checked like a built-in one.
- **`isValid` checks the shape of a code.** It is true for `NNN_NAME`: a digit `0` to `5`, two digits, an underscore, then upper-case letters, digits and underscores. It no longer checks membership of the built-in list, so a well-formed code the framework does not define is now valid. To accept only the built-in statuses, use `Statuses.SCHEME_SET.has(status)`.
- **Seven new statuses.** `OPEN` (`105_OPEN`) and `SUBMITTED` (`106_SUBMITTED`) join the pending group; `READY` (`206_READY`), `PUBLISHED` (`207_PUBLISHED`) and `ISSUED` (`208_ISSUED`) the active one; `RESOLVED` (`306_RESOLVED`) the completed one; `VOIDED` (`508_VOIDED`) the failed one. Each is in its group set and in `SCHEME_SET`.
- **The leading-digit rule is for `Statuses` and the classes that extend it.** A domain class that uses the `NNN_` prefix as an ordinal step number must not go through these checks.
- **The `*_SCHEME_SET` sets and `CommonStatuses` are unchanged.** The sets stay the list of the built-in statuses, and `CommonStatuses.isValid` still checks its own five.

```typescript
import { Statuses } from '@venizia/ignis-kernel/statuses';

class OrderStatuses extends Statuses {
  static readonly SHIPPING = '209_SHIPPING';
}

OrderStatuses.isActive(OrderStatuses.SHIPPING); // true
```

## Who is affected

- **Code that relied on `Statuses.isValid` rejecting a well-formed code the framework does not define.** It now returns true. Check `Statuses.SCHEME_SET.has(status)` where you need the built-in list.
- **A subclass of `Statuses` that already defines one of the seven codes, or one of the seven names, for another meaning.** The new constant is inherited, so pick another code.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/common/statuses/common.ts` | kernel |
| `src/statuses.ts` | kernel |
