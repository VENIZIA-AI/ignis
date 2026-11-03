---
title: configs.artifacts Accepts { when, index } Entries - the Run-Mode Gate Lives in the Config
description: An entry of configs.artifacts can carry a when condition, so a worker or migration run keeps controllers and components out of the container without a hand-written filter.
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-06

## Conditional entries in `configs.artifacts`

<Badge type="tip" text="New Feature" />

**In one line.** An entry of `configs.artifacts` can carry a `when`; the indexes behind it register only when the condition answers true.

## What changed

- **`IConditionalArtifactIndex`** is new: `{ when: TArtifactCondition; index: TArtifactIndexInput }`. `TArtifactIndexInput` now also accepts it.
- **`when`** receives `{ application }` and may be async, like the `when` on a class decorator. It may ignore its argument and read the environment.
- **A false `when` drops the whole subtree**, nested arrays included. Nothing behind it is bound, so `bootChecks.binding.doVerify` never sees it either. A per-class `when` on a decorator still applies inside a kept subtree.
- **`ArtifactIndexHelper.flatten()`** is now async and takes `{ input, application }`.
- **Run-mode gate.** `registerArtifacts` runs at boot step 5, before `preConfigure()`. A gate that used to live in `preConfigure()` is now too late: after moving to the generated index, a worker boot mounted its REST routes with no authentication strategy bound.

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

## Who is affected

- **Applications that filter the index by run mode in their own code.** Replace the filter with conditional entries as above and delete the helper.
- **Applications that gate controllers in `preConfigure()`.** That gate no longer protects a worker: move it into `configs.artifacts`. This is a security fix, not a convenience.
- **Direct callers of `ArtifactIndexHelper.flatten()`.** It is async now and needs `application`.
- **Everyone else.** No action needed.

## Details

- Reference: [Artifact registration](/references/base/bootstrapping). Guide: [Registering artifacts](/guides/core-concepts/application/bootstrapping). Migration: [boot API removal](/guides/migrations/boot-api-removal-migration).
