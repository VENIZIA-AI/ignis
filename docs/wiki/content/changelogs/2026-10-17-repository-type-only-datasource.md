---
title: A Repository With a Type-Only DataSource Import Loads Under tsc
description: "@repository no longer throws 'Invalid constructor | Received: Function' when its first constructor parameter is typed by a type-only class import and the code was built with tsc."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-17

## A repository with a type-only DataSource import loads under tsc

<Badge type="info" text="Bug Fix" />

**In one line.** A `@repository` whose constructor takes `dataSource: BasePostgresDataSource`, imported with `import { type ... }`, now loads from a tsc-built `dist` the same way it already loaded under bun.

```typescript
import { model, repository } from '@venizia/ignis';
import { type BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';

@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository {
  constructor(public dataSource: BasePostgresDataSource) {}
}
```

## What changed

- For a type-only class import, tsc records `Function` as the parameter's type, where bun records `Object`. `@repository` already skipped its first-parameter check for `Object`. It now skips `Function` too, and injects the configured DataSource as before.
- An explicit `@inject` at parameter 0 is still checked, as before.

## Who is affected

- **Code built with tsc that types the repository's DataSource parameter with a type-only import.** That is the import the house lint rule `consistent-type-imports` writes. It used to throw at import time with `Invalid constructor | First parameter must extend AbstractDataSource | Received: 'Function'`. Upgrade and remove any lint disable that kept a value import there.
- **Everyone else.** No action needed. A first parameter of a real class that is not a DataSource is still rejected.
