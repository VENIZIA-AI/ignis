---
type: Package
title: boot
description: Convention-based auto-discovery and bootstrapping for controllers, services, repositories, and datasources.
resource: packages/boot
tags: [packages, boot, bootstrapping]
---

`@venizia/ignis-boot` sits between `helpers` and `core` in the dependency chain (`dev-configs -> inversion -> helpers -> boot -> core`). It discovers artifact files by glob pattern and registers them into the IoC container, so applications do not have to manually wire up every controller, service, repository, and datasource. It depends only on `@venizia/ignis-inversion` and `glob`, and ships a dual CJS + ESM build. See [Boot lifecycle](/architecture/boot-lifecycle.md).

## Three-phase lifecycle

Every booter runs through **configure -> discover -> load**:

1. **configure** - merge user-supplied options with defaults (directories, extensions, nesting, glob pattern).
2. **discover** - glob the filesystem for matching files, producing `discoveredFiles[]`.
3. **load** - dynamically import each file, filter for class exports, producing `loadedClasses[]`, then bind each class into the container.

`BaseArtifactBooter` (`src/base/base-artifact-booter.ts`) implements this as a Template Method: it owns `configure()`/`discover()`/`load()` and delegates to abstract `getDefaultDirs()`, `getDefaultExtensions()`, and `bind()` for subclass-specific behavior.

## Built-in booters

`src/booters/` ships four booters, each targeting a default directory and file extension and binding into a namespace:

| Booter | Default dir | Extension | Namespace | Scope |
|---|---|---|---|---|
| `ControllerBooter` | `controllers/` | `.controller.js` | `controllers` | transient |
| `ServiceBooter` | `services/` | `.service.js` | `services` | transient |
| `RepositoryBooter` | `repositories/` | `.repository.js` | `repositories` | transient |
| `DatasourceBooter` | `datasources/` | `.datasource.js` | `datasources` | singleton |

Datasources bind as singletons deliberately, to share one connection pool per datasource class rather than opening a new pool per resolution.

## Orchestration

`Bootstrapper` (`src/bootstrapper.ts`) discovers all registered booters via `findByTag({ tag: 'booter' })` and runs every lifecycle phase across them sequentially, timing each phase and wrapping any thrown error with the phase name and booter class name for context.

`BootMixin` (`src/boot.mixin.ts`) is the entry point applications use: it mixes boot capability onto any `Container` subclass, and its constructor auto-registers the four built-in booters (each tagged `'booter'`) plus a singleton `Bootstrapper`.

## Extending

A custom booter (e.g. for `handlers/`) extends `BaseArtifactBooter`, implements `getDefaultDirs()`, `getDefaultExtensions()`, and `bind()`, and is registered the same way the built-ins are: `bind({ key: 'booter.HandlerBooter' }).toClass(HandlerBooter).setTags('booter')`.

## Gotcha: `isClass`

`isClass` is not declared in boot. It lives in `inversion` (`common/types.ts`) because the container, controller factories, and `resolveValue` all need to branch on the exact same predicate; `helpers` re-exports it, and boot imports it from `@venizia/ignis-helpers` rather than redeclaring it. The predicate checks class syntax specifically (`typeof x === 'function' && x.prototype !== undefined`), not mere callability - a plain non-arrow function would otherwise satisfy a looser check and get discovered and instantiated as if it were an artifact class.

## Related

- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [inversion](/packages/inversion.md)
- [core](/packages/core.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
