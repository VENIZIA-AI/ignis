---
title: dev-configs Adds Lint Rules for Awaited Promise Chains and Silent Catches
description: "@venizia/dev-configs adds two opt-in lint rules: never await a .then/.catch/.finally chain, and never swallow an error in a catch; devz codemod async-style fixes the safe shape."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-31

## Awaited promise chains and silent catches

<Badge type="tip" text="New Feature" />

**In one line.** Lint now catches `await f().catch(() => null)`, which mixes two async styles and hides the failure, and any `catch` that swallows an error with no trace; both are off until you spread `asyncStyleConfigs`.

## What changed

- **`venizia/no-await-promise-chain`.** An `await` of a `.then`, `.catch` or `.finally` chain is reported, once per `await`. A chain that is returned or stands as a statement is fine, and so is `await Promise.all(items.map(save))`.
- **A fix for one shape only.** `const x = await f().catch(() => <value>)` becomes `let x; try { x = await f(); } catch (error) { x = <value>; }`. The value must be a literal, an identifier, a read of the error or an array or object literal of those, and `x` is never written again. The `const` becomes a `let` and a type annotation stays. Everything else (`.then`, `.finally`, a handler with a block body or a call) is reported for you to rewrite.
- **`venizia/no-silent-catch`.** Reports `.catch(() => null)`, `.catch(() => {})`, and a `catch` block that is empty, holds only a comment, or only returns or assigns a constant. A catch that logs, rethrows, wraps, reads the error or calls anything passes. There is no fix: you decide what to log.
- **`devz codemod async-style`.** Also applies the new fix, and lists the rest and every silent catch with file and line.

## How to turn them on

Nothing new to wire: both rules are in `asyncStyleConfigs` and `reactAsyncStyleConfigs`.

```javascript
// .configs/lints/eslint.config.mjs
import { asyncStyleConfigs, houseConfigs } from '@venizia/dev-configs/linters';

export default [...houseConfigs, ...asyncStyleConfigs];
```

## Who is affected

- **Projects that do not spread the async style arrays.** No action needed: the rules are off.
- **Projects that already spread them.** The two rules start reporting on update. Run `devz codemod async-style <package>` to see the plan, commit your work, then run it with `--write`. The fix of `.catch(() => null)` leaves `catch (error) { x = null; }`, which `no-silent-catch` then reports: add the log, or keep it with an `eslint-disable-next-line` and the reason. See [Async Style](/best-practices/code-style-standards/async-style).
