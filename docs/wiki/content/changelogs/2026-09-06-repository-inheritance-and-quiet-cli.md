---
title: A Bare @repository() Inherits Its Parent's Model and Datasource; the Console Fallback Warns on the First Log Line; ignis-artifacts Runs Silently
description: A subclass decorated with @repository() and no options reuses the model and datasource its parent declared, so the generated index can list it. The helpers console fallback warns when a line is actually logged, not when a helper acquires its logger, and the ignis-artifacts CLI installs a quiet provider.
---

# Changelog - 2026-09-06

## `@repository()` on a subclass

<Badge type="tip" text="New Feature" />

**In one line.** A repository subclass that only adds methods is decorated with a bare `@repository()` and takes `model` and `dataSource` from the nearest decorated parent.

```typescript
@repository({ model: Ticket, dataSource: PostgresDataSource })
export class TicketRepositoryCore extends DefaultCRUDRepository<typeof Ticket> {}

@repository()
export class TicketRepository extends TicketRepositoryCore {
  findOpen() { /* ... */ }
}
```

## The problem it solves

Artifact metadata (`binding`, `scope`, `order`, `when`, `allowOverride`) is own metadata, so an undecorated subclass is invisible to `ignis-artifacts` and to `configs.artifacts`; it had to be named by hand. Copying the parent's `model` and `dataSource` into 54 subclasses by hand is the kind of edit that goes wrong silently. The decorator now reads what the parent declared, at decoration time, through the prototype chain.

## What changed

- **`@repository(metadata?)`** - the argument is optional. With none, the class inherits `model`, `dataSource` and `operationScope` from the nearest decorated parent; its registration options are its own (none), so it registers under its own name and never inherits a custom `binding`. A bare `@repository()` on a class with no decorated parent throws at decoration: `[@repository][Orphan] No metadata given and no decorated repository above it in the prototype chain`.
- **Console fallback warning timing** (`@venizia/ignis-helpers`). `[LoggerResolver] Logging to the console: no logger provider is installed` is printed when the first line is actually routed to the console, not when a helper acquires its logger. A script that imports the barrel and installs a provider before logging stays silent.
- **`ignis-artifacts`** installs a quiet provider before anything else loads: `debug` and `info` are dropped, `warn` and above go to stderr, stdout carries only the command's result.

## Who is affected

- **Applications with undecorated repository subclasses.** Add `@repository()` and regenerate the index; delete the hand-written entries.
- **Scripts that saw the fallback warning at import time.** It moves to the first log line, or disappears when a provider is installed first.
- **Everyone else.** No action needed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `repository(metadata?)` | Argument optional; inherits from the decorated parent | kernel |
| `LoggerResolver.warnConsoleFallbackOnce()` | Public; called by the console resolver on first use | helpers |
| `ignis-artifacts` CLI | Quiet logger provider installed first | boot |
