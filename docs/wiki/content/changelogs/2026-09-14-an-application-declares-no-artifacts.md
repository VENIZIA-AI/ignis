---
title: An Application Lists None Of Its Own Artifacts
description: "configs.discoverArtifacts: true registers every decorated class in the import graph, so a decorator is the whole declaration."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-09-14

## An application lists none of its own artifacts

<Badge type="tip" text="Feature" />

**In one line.** Set `discoverArtifacts: true`, import the generated file for its side effects, and every decorated class registers itself.

```ts
// index.ts - side effects only. No list, no export to name.
import './generated/artifacts';

// application.ts
export const beConfigs: IApplicationConfigs = {
  path: { base: '/', isStrict: true },
  discoverArtifacts: true,
};
```

## What changed

- **`@service()` is the whole declaration.** `@service`, `@repository`, `@controller`, `@datasource`, `@component`, `@configuration` and `@model` record the class at import time. `@model` is recorded and then skipped, because its repository registers it.
- **Off until you ask.** Behaviour by setting:

| `discoverArtifacts` | `artifacts` | What registers |
|---|---|---|
| unset | unset | nothing - unchanged |
| unset | set | exactly what it lists - unchanged |
| `true` | unset | every decorated class |
| `true` | set | the union, de-duplicated |

- **Several applications in one process.** The discovered list is process-wide. A class with no `when` registers in every application of the process. Filter with `when`, which receives the application: `@controller({ when: ({ application }) => application instanceof SearchApplication })`.
- **Framework components stay explicit.** No class inside IGNIS carries a decorator, so discovery never turns one on. Register them yourself:

```ts
preConfigure() {
  this.component(HealthCheckComponent);
  this.component(StaticAssetComponent);
}
```

## Who is affected

- **You set `configs.artifacts`.** Nothing. Same behaviour, same classes, same order.
- **You want to stop listing.** Replace `import { GeneratedArtifacts } from './generated/artifacts'` with `import './generated/artifacts'`, set `discoverArtifacts: true`, delete the `artifacts` entry, and move any framework component into `preConfigure()`.
- **You run several applications in one process.** Read the `when` point above before setting the flag.
