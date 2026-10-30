---
title: dev-configs Adds Opt-In Async Style Lint Rules and a Codemod
description: "@venizia/dev-configs adds four lint rules for await, return and React hooks, off until you spread asyncStyleConfigs, and devz codemod async-style to fix a codebase."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-29

## Async style lint rules and a codemod

<Badge type="tip" text="New Feature" />

**In one line.** After updating `@venizia/dev-configs` you can turn on four rules that keep `await` on its own line, stop `return await`, and keep async functions out of React hooks; nothing changes until you spread the new config arrays.

## What changed

- **`venizia/no-inline-await`.** `await` is a whole statement or the whole initializer of a declaration, never inside a call, a ternary, a template literal or an assignment. Test files follow it too.
- **`venizia/no-return-await`.** `return await f()` becomes `return f()`; inside `try`, `catch` or `finally` it becomes `const result = await f(); return result;`.
- **`venizia/no-async-hook-callback`.** No `use...` call receives an async function.
- **`venizia/effect-cleanup-consistency`.** An effect callback returns nothing on every path or a cleanup on every path.
- **`devz codemod async-style`.** Applies the fixes of the first two rules across a codebase (a dry run unless `--write`; `--check` exits 1 when anything is left) and lists what it cannot fix, with file and line.

## How to turn them on

```javascript
// .configs/lints/eslint.config.mjs
import { asyncStyleConfigs, houseConfigs } from '@venizia/dev-configs/linters';

export default [...houseConfigs, ...asyncStyleConfigs];
```

A React project spreads `reactHouseConfigs` and `reactAsyncStyleConfigs`. The rules are at `error`. A later release will include them in `houseConfigs` and `reactHouseConfigs`; the two new exports will stay as aliases.

## Who is affected

- **Projects that update and change nothing.** No action needed: the rules are off.
- **Projects that turn them on.** Run `devz codemod async-style <package>` to see the plan, commit your work, then run it again with `--write`; what it cannot fix is listed for you to fix by hand. See [Async Style](/best-practices/code-style-standards/async-style).
