---
title: An Application Lists None Of Its Own Artifacts
description: "configs.discoverArtifacts: true registers every decorated class in the import graph, so a stereotype is the whole declaration. when still keeps several applications in one process apart."
---

# Changelog - 2026-09-14

## An application lists none of its own artifacts

<Badge type="tip" text="Feature" />

**In one line.** Set `discoverArtifacts: true`, import the generated file for its side effects, and
every decorated class registers itself.

```ts
// index.ts - side effects only. No list, no export to name.
import './generated/artifacts';

// application.ts
export const beConfigs: IApplicationConfigs = {
  path: { base: '/', isStrict: true },
  discoverArtifacts: true,   // no list of services, repositories, components or configurations
};
```

`@service()` on the class is the whole declaration. Before, the decorator said what a class is and
`configs.artifacts` separately said the class exists - two statements for one fact, and the second
was hand-maintained.

## Why discovery happens at import, not at boot

A class exists at run time only because something imported it. That rules out the boot-time
filesystem scan other frameworks use: a compiled single-file binary has no source tree to walk, and
IGNIS removed that machinery on purpose.

So `injectable` - the one function `@service`, `@repository`, `@controller`, `@datasource`,
`@component`, `@configuration` and `@model` all call - records the class as it decorates it. The
generated file already imports every one of those classes, so importing it is what makes them exist.

`@model` is recorded and then skipped: a model has a binding namespace but no index field, because
its repository registers it.

## Discovery is off until you ask, and that is deliberate

| `discoverArtifacts` | `artifacts` | What registers |
|---|---|---|
| unset | unset | nothing - unchanged |
| unset | set | exactly what it lists - unchanged |
| `true` | unset | every decorated class |
| `true` | set | the union, de-duplicated |

**An absent `artifacts` still registers nothing.** Reading it as "register everything" was the first
shape of this change, and it is a trap: a consumer whose `createAppConfig` omits the key on purpose
would have booted with every decorated class in the binary - no compile error, no warning, just ten
times the bindings. One of its applications does exactly that, deliberately, to register nothing.

The two compose because a library exports an index and an application still wants to discover its own
classes beside it. A class named in both registers once.

## Several applications in one process

The discovered list is process-wide, so without a filter every application registers everything.
`when` already carries this, and already receives the application:

```ts
@controller({ when: ({ application }) => application instanceof SearchApplication })
class OrderController {}
```

**A class with no `when` registers in every application of the process.** That is the cost, and it is
why a worker that must not mount controllers keeps using `when`.

## Framework components stay explicit

No class inside IGNIS carries a stereotype, so discovery never turns on a framework component behind
your back. Choosing which features an application runs is a real decision, and it stays one:

```ts
preConfigure() {
  this.component(HealthCheckComponent);
  this.component(StaticAssetComponent);
}
```

## Measured on the reference application

`examples/vert` lists none of its own. A probe booting it finds 2 services, 10 repositories, 3
controllers, 1 datasource and 1 component - the same 17 classes its generated index listed, class for
class.

## Who is affected

**You set `configs.artifacts`.** Nothing. Same behaviour, same classes, same order.

**You want to stop listing.** Replace `import { GeneratedArtifacts } from './generated/artifacts'`
with `import './generated/artifacts'`, set `discoverArtifacts: true`, delete the `artifacts` entry,
and move any framework component into `preConfigure()`.

**You run several applications in one process.** Read the `when` section before setting the flag.

**Files:**

- [`packages/kernel/src/base/metadata/injectable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/metadata/injectable.ts) - records the class it decorates
- [`packages/kernel/src/base/applications/artifact-index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/artifact-index.ts) - `buildDiscoveredIndex`
- [`packages/kernel/src/base/applications/rest.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/rest.ts) - `registerDiscoveredArtifacts`
