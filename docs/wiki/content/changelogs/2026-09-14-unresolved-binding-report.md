---
title: The Container Can Name A Binding Nobody Resolves
description: doVerify catches a dependency injected but never registered. The reverse - a class registered that nothing injects - was silent. The container now counts what it hands out.
---

# Changelog - 2026-09-14

## The container can name a binding nobody resolves

<Badge type="tip" text="Feature" />

**In one line.** The container counts every key it hands out, so an application can ask which
registrations nothing ever read.

```ts
await application.initialize();
application.startResolutionCounting();   // counting is off until you ask

// ... run the traffic that exercises the application ...

application.getUnresolvedBindings();   // ['repositories.OrphanRepository', ...]
```

## The asymmetry it closes

| The mistake | Before |
|---|---|
| A dependency is injected but never registered | boot dies, naming the class - `bootChecks.binding.doVerify` |
| A class is registered but nothing ever injects it | nothing says anything, ever |

So a hand-written artifact list can only grow. Someone adds a repository, a later change removes the
last site that injects it, and the registration line stays. Measured in one downstream service: 59
repositories declared by hand, 47 actually injected.

A static scan cannot answer this, and that is not a tooling gap. The same service resolves five
repositories by building a binding key at run time, which no grep sees - a static verdict would
condemn five live registrations.

## Four members, and counting is off until you ask

| Member | Answers |
|---|---|
| `getResolutionCounts()` | a copy of key to read count; a key bound and never read is absent |
| `startResolutionCounting()` | clears the counts and starts counting - OFF by default |
| `stopResolutionCounting()` | stops counting, keeps what was counted |
| `getUnresolvedBindings({ tags })` | bound keys with no count, defaulting to `services` and `repositories` |

**Counting is off by default, and that is the point.** The counter sits on `BaseContainer.get`, the
one method every injection passes through. Measured over 2 million resolutions: **89 ns with counting
off, 96 ns with it on.** An application that never reads the report pays nothing.

**Start after `initialize()`.** `doVerify: true` reads every service and repository at boot, so
counting across boot reports empty by construction. Starting is also the reset. Reading the report
without having started **throws**, naming the method to call - a list that names every binding is a
wrong answer, not an empty one.

## A count of zero is evidence, not a verdict

An unread binding may be dead code. It may equally be an allow-list entry, or a technical floor only
one deployment exercises. The framework cannot tell those apart, so it reports and stops there - no
warning, no boot gate, no deletion. Read the list yourself.

## Who is affected

**Nobody, unless you ask.** No new boot step, no new option, no behaviour change, and no cost until
`startResolutionCounting()` runs.

**Files:**

- [`packages/inversion/src/modules/container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts) - `startResolutionCounting`, `getResolutionCounts`
- [`packages/kernel/src/base/applications/rest.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/rest.ts) - `RestApplication.getUnresolvedBindings`
