---
title: configs.artifacts Accepts { when, index } Entries - the Run-Mode Gate Lives in the Config
description: TArtifactIndexInput gains a conditional entry. registerArtifacts evaluates when at boot step 5 and registers the entry's indexes only when it answers true, so a worker or a migration run keeps controllers and components out of the container without a hand-written filter.
---

# Changelog - 2026-09-06

## Conditional entries in `configs.artifacts`

<Badge type="tip" text="New Feature" />

**In one line.** An entry of `configs.artifacts` can carry a `when`; the indexes behind it register only when the condition answers true.

```typescript
const runMode = process.env.RUN_MODE ?? 'server';

export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: [
    { dataSources: GeneratedArtifacts.dataSources, repositories: GeneratedArtifacts.repositories },
    { when: () => runMode !== 'migrate', index: { services: GeneratedArtifacts.services, components: GeneratedArtifacts.components } },
    { when: () => runMode === 'server', index: { controllers: GeneratedArtifacts.controllers } },
  ],
};
```

## The problem it solves

`registerArtifacts` runs at boot step 5, before `preConfigure()`. An application that used to skip `configureControllers()` and `configureSecurity()` in worker mode kept that gate in `preConfigure()`, one step too late: after moving to the generated index, a worker boot mounted its REST routes with no authentication strategy bound. A migration run started every component - Kafka consumers, Redis clients, queue workers - for a job that only needs repositories. The only fix was a hand-written filter over the index.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `IConditionalArtifactIndex` | New: `{ when: TArtifactCondition; index: TArtifactIndexInput }` | kernel |
| `TArtifactIndexInput` | Now `IArtifactIndex \| IConditionalArtifactIndex \| TArtifactIndexInput[]` | kernel |
| `ArtifactIndexHelper.flatten()` | Now async; takes `{ input, application }`; drops a conditional subtree whose `when` answers false | kernel |

- `when` receives `{ application }` and may be async, the same signature as the `when` on a class decorator. It may ignore its argument and read the environment instead.
- A false `when` drops the whole subtree, nested arrays included. Nothing behind it is bound, so `bootChecks.binding.doVerify` never sees it either.
- A per-class `when` on a decorator still applies inside a kept subtree.
- The entry also carries the five kind fields typed `never`, so code that destructures `controllers`, `services` and so on from a non-array input still compiles against the widened union.

## Who is affected

- **Applications that filter the index by run mode in their own code.** Replace the filter with conditional entries as above and delete the helper.
- **Applications that gate controllers in `preConfigure()`.** That gate no longer protects a worker: move it into `configs.artifacts` as shown. This is a security fix, not a convenience.
- **Callers of `ArtifactIndexHelper.flatten()` directly.** It is async now and needs `application`.
- **Everyone else.** No action needed.

## Details

- Reference: [Artifact registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping). Migration: [boot API removal](/guides/migrations/boot-api-removal-migration).
