---
title: Exports that nothing used are removed
description: "A dozen exports with no user in IGNIS, ARDOR or the apps we checked are removed: TApplicationError, six filter types, the App constants, ReactEslintConfigs, isSqliteTransaction, two kernel metadata interfaces and the ts-node block of tsconfig.common.json."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-filter', '@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-02

## Exports that nothing used are removed

<Badge type="warning" text="Breaking Change" />

**In one line.** If your code imports one of the names below, it stops compiling after the update; each row says what to use instead, and most have no user at all.

## What changed

- **Types and a class with no reader are gone.** Nothing in IGNIS, ARDOR or the downstream code we checked imports them.
- **`ReactEslintConfigs` is gone.** `ReactOxlintConfigs` is the React lint preset; `reactNamingConventionConfigs` stays.
- **`tsconfig.common.json` no longer carries a `ts-node` block.** `tsc` and Bun never read it.

## Who is affected

- **Code that imports a removed name.** Use the replacement in the table.
- **Projects that run ts-node on a tsconfig that extends `tsconfig.common.json`.** Add `"ts-node": { "transpileOnly": true }` to your own tsconfig.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Code that imports a removed name fails to compile after the update.

| Removed | Package | Use instead |
|---|---|---|
| `TApplicationError` | `@venizia/ignis-inversion` and what re-exports it | `ApplicationError` |
| `TLimit`, `TOffset`, `TSkip` | `@venizia/ignis-filter` | `number \| undefined` |
| `TOrderBy` | `@venizia/ignis-filter` | `string[] \| undefined` |
| `TQueryOperator` | `@venizia/ignis-filter` | `TConstValue<typeof QueryOperators>` (`TConstValue` is from `@venizia/ignis-inversion`) |
| `TQuerySchemas` | `@venizia/ignis-filter/schemas` | `ReturnType<typeof QuerySchemaFactory.build>` |
| `App` (`APPLICATION_NAME`, `DEFAULT_QUERY_LIMIT`, `DEFAULT_QUERY_OFFSET`, `DS_POSTGRES`, `DS_MEMORY`, `DS_REDIS`) | `@venizia/ignis` | Nothing read it. Write the value you need (`50`, `0`, `'postgresql'`, `'memory'`, `'redis'`), or read the application name from `applicationEnvironment` |
| `isSqliteTransaction` | `@venizia/ignis-connectors/sqlite` | `isRelationalTransaction(transaction)` from `@venizia/ignis-connectors`, which does the same check, with a cast to `ISqliteTransaction` where you need that type |
| `IInjectMetadata`, `IPropertyMetadata` | `@venizia/ignis-kernel`, `@venizia/ignis` | Import them from `@venizia/ignis-inversion`, which defines them |
| `ReactEslintConfigs`, `IReactEslintPlugins` | `@venizia/dev-configs` | `ReactOxlintConfigs` (oxlint), or spread `eslintConfigs` and add the React rules in your own ESLint config |

**Before:**

```typescript
import type { IInjectMetadata } from '@venizia/ignis';
import type { TQueryOperator } from '@venizia/ignis-filter';
```

**After:**

```typescript
import type { IInjectMetadata, TConstValue } from '@venizia/ignis-inversion';
import type { QueryOperators } from '@venizia/ignis-filter';

type TQueryOperator = TConstValue<typeof QueryOperators>;
```

## Details

- **Apps created from the IGNIS preset.** The Dockerfile now builds on `oven/bun:1.4.4-alpine`, the Bun version the repository requires. An existing app edits its own `FROM` line.
