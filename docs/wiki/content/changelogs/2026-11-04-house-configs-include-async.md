---
title: houseConfigs carries the async style rules, and asyncStyleConfigs is gone
description: "houseConfigs and reactHouseConfigs now include the async style and hook rules. asyncStyleConfigs and reactAsyncStyleConfigs are removed, so a project's lint config is one array."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-04

## houseConfigs carries the async style rules, and asyncStyleConfigs is gone

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `houseConfigs` now includes the four async style rules and `reactHouseConfigs` also includes the two hook rules, so a project's ESLint config is `export default houseConfigs;` and nothing can be left out by forgetting a second array.

## What changed

- **`houseConfigs`** carries `no-inline-await`, `no-return-await`, `no-await-promise-chain` and `no-silent-catch`, at `error`, in test files too.
- **`reactHouseConfigs`** carries the same four and the two hook rules, `no-async-hook-callback` and `effect-cleanup-consistency`. It did not have `no-inline-await` or `no-return-await` before.
- **`asyncStyleConfigs` and `reactAsyncStyleConfigs` are removed**, with no alias.

## Who is affected

- **A project that spreads `asyncStyleConfigs` or `reactAsyncStyleConfigs`.** The import no longer exists. Drop it and the spread.
- **A React project that did not spread the second array.** It now gets the four async rules and the two hook rules. Run `devz codemod async-style` for the fixable findings.
- **A project that spreads only `houseConfigs`.** It now gets the four async rules. Same codemod.

## Migration

```javascript
// .configs/lints/eslint.config.mjs - before
import { asyncStyleConfigs, houseConfigs } from '@venizia/dev-configs/linters';

export default [...houseConfigs, ...asyncStyleConfigs];
```

```javascript
// after
import { houseConfigs } from '@venizia/dev-configs/linters';

export default houseConfigs;
```

A project that adds its own entries spreads the array: `export default [...houseConfigs, { ... }];`. A React project uses `reactHouseConfigs` the same way.
