---
title: Artifact Identity No Longer Rides on the Class Name
description: "A minified build renames classes. Two classes that derive one binding key now fail registration, @repository injects a decorated datasource by its class, and the repository and datasource registries are keyed by class."
---

# Changelog - 2026-10-06

## Artifact identity no longer rides on the class name

<Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A minified build renames `OrderService` to `e` and gives classes in different chunks the same short name. IGNIS no longer lets that hand one class another's instance.

| Before | Now |
|---|---|
| Two classes minified to `e` both derived `services.e`; the second silently replaced the first, and `@inject({ target })` got the wrong instance | `registerArtifacts` throws: `Two classes derive the binding key 'services.e' from their class name`, naming the fix. `bootChecks.allowDerivedKeyCollision: true` makes it a warning |
| `@repository` with no `@inject` built `datasources.<ClassName>` at decoration, so `@datasource({ binding: { key: 'ApiDataSource' } })` was missed once the class was renamed | The datasource is injected by its class: the container reads the key its registration recorded - decorated, `bindingList()` or `dataSource(X, { binding })` - and falls back to the derived key for a class bound raw |
| An explicit `@inject` at index 0 was still checked against the parameter type: an interface or `import type` parameter threw under Bun/tsc and passed under Vite | An explicit `@inject` decides for itself; an `Object` parameter type is not checked |
| A datasource pinned to its own namespace (`remotes.catalog`) was refused by an explicit `@inject({ target })` | A `target` class is judged by its datasource brand, in any namespace |
| A repository found its model, and a datasource its models, by class name - two same-named classes swapped tables | Both registries are keyed by class |
| Configurations ordered by `after` were keyed by class name; two same-named configurations dropped one | The ordering graph is keyed by class |

**One key derivation, exported.** `ArtifactBindingKeys` (from `@venizia/ignis-kernel/metadata`) is the single place a key is derived: `resolve({ target, namespace, binding? })`, `findDerivedCollisions({ entries })` and `assertNoDerivedCollision({ entries, caller })`. `namespace` is a plain string. A framework that registers artifacts itself calls it rather than copying the rule.

The check runs over one `registerArtifacts` call - never at decoration and never in `Container.bind`, where a rebind is deliberate. A hand registration after it is not cross-checked.

A hot reload that re-registers in the same process (a discovery app re-booting inside a Vite Worker) decorates a second class with the same name, and looks exactly like a real collision. Set `bootChecks.allowDerivedKeyCollision` there - `examples/browser-bff` sets it from `import.meta.hot`, which a production build does not have.

Injecting by class needs `@venizia/ignis-inversion` that reads a class before its key, released alongside. An older inversion reads the key first, which is the old behaviour, not a failure.

## Who is affected

- **A minified build with stereotyped classes and no pinned `binding`.** If two classes collide, registration now fails, naming the key. Pin `binding: { namespace, key }` on them, or build with names kept (`keepNames`).
- **A test process that registers discovered artifacts from several files.** Two same-named stereotyped classes in different files now collide. Rename one, or pin its `binding`.
- **Code that reads `datasourceModels` or `repositoryBindings` directly.** The first is keyed by class (or by the string a repository named). Read it through `getModelClasses` / `getRepositoryBinding({ target })`.
- **Two applications in one process that bind one datasource class under two keys.** The key is recorded per class, so both read the last one recorded. Give each application its own class.
- **Everyone else.** No change: an unminified class derives the same key as before.

**Files:** [`packages/kernel/src/base/metadata/artifact-keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/metadata/artifact-keys.ts), [`packages/kernel/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/metadata/persistents.ts), [`packages/kernel/src/base/applications/rest.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/applications/rest.ts), [`packages/kernel/src/helpers/inversion/mixins/repository.mixin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/helpers/inversion/mixins/repository.mixin.ts)
