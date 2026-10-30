---
title: A Bare @repository() Inherits Its Parent's Model and Datasource; the Console Fallback Warns on the First Log Line; ignis-artifacts Runs Silently
description: A subclass decorated with a bare @repository() reuses its parent's model and datasource, the helpers console fallback warns on the first logged line, and the ignis-artifacts CLI runs quietly.
packages: ['@venizia/ignis-boot', '@venizia/ignis-helpers', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-06

## `@repository()` on a subclass

<Badge type="tip" text="New Feature" />

**In one line.** A repository subclass that only adds methods is decorated with a bare `@repository()` and takes `model` and `dataSource` from the nearest decorated parent.

## What changed

- **`@repository(metadata?)`** - the argument is optional. With none, the class inherits `model`, `dataSource` and `operationScope` from the nearest decorated parent. Its registration options (`binding`, `scope`, `order`, `when`, `allowOverride`) are its own and empty, so it registers under its own name and never inherits a custom `binding`. A bare `@repository()` on a class with no decorated parent throws at decoration: `[@repository][Orphan] No metadata given and no decorated repository above it in the prototype chain`.
- **Console fallback warning timing** (`@venizia/ignis-helpers`). `[LoggerResolver] Logging to the console: no logger provider is installed` now prints when the first line is routed to the console, not when a helper acquires its logger. A script that installs a provider before logging stays silent.
- **`ignis-artifacts`** installs a quiet provider first: `debug` and `info` are dropped, `warn` and above go to stderr, and stdout carries only the command's result.

```typescript
@repository({ model: Ticket, dataSource: PostgresDataSource })
export class TicketRepositoryCore extends DefaultCRUDRepository<typeof Ticket> {}

@repository()
export class TicketRepository extends TicketRepositoryCore {
  findOpen() { /* ... */ }
}
```

## Who is affected

- **Applications with undecorated repository subclasses.** Add `@repository()`, regenerate the index and delete the hand-written entries. An undecorated subclass is invisible to `ignis-artifacts` and `configs.artifacts`.
- **Scripts that saw the fallback warning at import time.** It moves to the first log line, or disappears when a provider is installed first.
- **Everyone else.** No action needed.
