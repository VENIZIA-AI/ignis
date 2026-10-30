---
title: Artifact Identity No Longer Rides on the Class Name
description: "Two classes that derive one binding key now fail registration, @repository injects a decorated datasource by its class, and the repository and datasource registries are keyed by class, so a minified build no longer hands one class another's instance."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-06

## Artifact identity no longer rides on the class name

<Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A minified build renames `OrderService` to `e` and gives classes in different chunks the same short name. IGNIS no longer lets that hand one class another's instance.

## What changed

- **A name collision fails registration.** Before, two classes minified to `e` both derived `services.e`; the second silently replaced the first. Now `registerArtifacts` throws `Two classes derive the binding key 'services.e' from their class name`, naming the fix. `bootChecks.allowDerivedKeyCollision: true` makes it a warning.
- **`@repository` injects its datasource by class.** Before, `@repository` with no `@inject` built `datasources.<ClassName>`, which missed a renamed class with `@datasource({ binding: { key: 'ApiDataSource' } })`. Now the container reads the key the registration recorded (decorated, `bindingList()` or `dataSource(X, { binding })`) and falls back to the derived key for a class bound raw. This needs the `@venizia/ignis-inversion` released alongside; an older one keeps the old behaviour, not a failure.
- **An explicit `@inject` at index 0 decides for itself.** Before, it was still checked against the parameter type, so an interface or `import type` parameter threw under Bun and tsc and passed under Vite. An `Object` parameter type is not checked.
- **A datasource pinned to its own namespace** (`remotes.catalog`) is no longer refused by an explicit `@inject({ target })`. A `target` class is judged by its datasource brand, in any namespace.
- **Registries are keyed by class.** A repository found its model, and a datasource its models, by class name, so two same-named classes swapped tables. Configurations ordered by `after` had the same problem.
- **`ArtifactBindingKeys`** (from `@venizia/ignis-kernel/metadata`) is the single key derivation: `resolve({ target, namespace, binding? })`, `findDerivedCollisions({ entries })` and `assertNoDerivedCollision({ entries, caller })`. A framework that registers artifacts itself should call it.

## Who is affected

- **A minified build with stereotyped classes and no pinned `binding`.** If two classes collide, registration now fails, naming the key. Pin `binding: { namespace, key }` on them, or build with names kept (`keepNames`).
- **A test process that registers discovered artifacts from several files.** Two same-named stereotyped classes in different files now collide. Rename one, or pin its `binding`.
- **Code that reads `datasourceModels` or `repositoryBindings` directly.** Read it through `getModelClasses` / `getRepositoryBinding({ target })`.
- **Two applications in one process that bind one datasource class under two keys.** The key is recorded per class, so both read the last one. Give each application its own class.
- **Everyone else.** No change: an unminified class derives the same key as before.

## Details

- The check runs over one `registerArtifacts` call, never at decoration and never in `Container.bind`. A hand registration after it is not cross-checked.
- A subclass registered after its same-named parent is the override pattern and is not a collision. A parent registered after its subclass would replace it, and is.
- A hot reload that re-registers in the same process (a discovery app re-booting inside a Vite Worker) looks exactly like a collision. Set `bootChecks.allowDerivedKeyCollision` there.
