---
title: The Container Can Name A Binding Nobody Resolves
description: The container can count what it hands out, so an application can list registrations that nothing ever read.
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-14

## The container can name a binding nobody resolves

<Badge type="tip" text="Feature" />

**In one line.** The container counts every key it hands out, so an application can ask which registrations nothing ever read.

```ts
await application.initialize();
application.startResolutionCounting();   // counting is off until you ask

// ... run the traffic that exercises the application ...

application.getUnresolvedBindings();   // ['repositories.OrphanRepository', ...]
```

## What changed

- **`getResolutionCounts()`.** A copy of key to read count; a key bound and never read is absent.
- **`startResolutionCounting()`.** Clears the counts and starts counting. Off by default, so an application that never reads the report pays nothing.
- **`stopResolutionCounting()`.** Stops counting, keeps what was counted.
- **`getUnresolvedBindings({ tags })`.** Bound keys with no count, defaulting to `services` and `repositories`. Reading it without having started counting throws, naming the method to call.

## Who is affected

- **Nobody, unless you ask.** No new boot step, option or behaviour change.

## Details

- Start counting after `initialize()`. `doVerify: true` reads every service and repository at boot, so counting across boot reports empty.
- A count of zero is evidence, not a verdict. An unread binding may be dead code, an allow-list entry, or something only one deployment exercises. The framework reports and does nothing else.
