---
title: The mail type guards are static methods of MailTypeUtility
description: "isMailTransport and isValidMailOptions in @venizia/ignis/mail are removed; call MailTypeUtility.isTransport and MailTypeUtility.isValidOptions, or run devz codemod namespace-functions."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-02

## The mail type guards are static methods of MailTypeUtility

<Badge type="warning" text="Breaking Change" />

**In one line.** `isMailTransport` and `isValidMailOptions` from `@venizia/ignis/mail` no longer exist as functions; call `MailTypeUtility.isTransport` and `MailTypeUtility.isValidOptions` instead.

## What changed

- **Two names are renamed, with no alias.** `isMailTransport` is now `MailTypeUtility.isTransport`. `isValidMailOptions` is now `MailTypeUtility.isValidOptions`.
- **The arguments do not change.** Each guard still takes its value as one positional parameter, and it still narrows that value (`IMailTransport`, `TMailOptions`).
- **One command moves your calls.** `devz codemod namespace-functions` rewrites both names, including a name imported under an alias.

## Who is affected

- **Code that imports `isMailTransport` or `isValidMailOptions`.** It fails to compile or to load until you rename the call. This is the same step as in [the old function names entry](/changelogs/2026-11-01-the-old-function-names-are-removed).
- **Everyone else.** No action. The mail component calls the guards itself.

## Details

**Before:**

```typescript
import { isMailTransport } from '@venizia/ignis/mail';

if (isMailTransport(candidate)) {
  await candidate.verify();
}
```

**After:**

```typescript
import { MailTypeUtility } from '@venizia/ignis/mail';

if (MailTypeUtility.isTransport(candidate)) {
  await candidate.verify();
}
```

| Old name | New form |
|---|---|
| `isMailTransport` | `MailTypeUtility.isTransport` |
| `isValidMailOptions` | `MailTypeUtility.isValidOptions` |

Upgrade: commit your work, run `bunx devz codemod namespace-functions` to see the calls it would change, then `bunx devz codemod namespace-functions --write`, then your formatter and type check.
