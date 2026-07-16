---
type: Architecture
title: Boot lifecycle
description: How the boot package discovers artifacts on disk by convention and turns them into container bindings.
resource: packages/boot/src
tags: [architecture, boot, discovery, conventions]
---

The `boot` package is IGNIS's convention-over-configuration layer. Instead of a registration file
that drifts out of sync with the code, booters glob the project directory, import what they find, and
bind every exported class into the container under the right namespace.

## Three phases, driven by the Bootstrapper

`BootPhases` are `configure`, `discover`, `load`, and `Bootstrapper.boot()` runs them **phase-major**:
every booter's `configure`, then every booter's `discover`, then every booter's `load`. That is what
lets booters be independent - none can observe another's half-finished state within a phase.

`Bootstrapper` finds its booters via `findByTag({ tag: 'booter' })`, so adding a booter is just
another binding. It resets its booter list at the start of each `discoverBooters` call: pushing onto
the previous run's list would register every artifact twice on a second `boot()`. An optional
`booters` filter narrows the run by class name.

A booter that does not implement a phase method is skipped, not an error. Each phase is timed, and
`boot()` returns an `IBootReport` with the booters that ran, per-phase durations, and the total. Any
throw inside a phase is re-wrapped with the booter name and phase - and always carries `cause`, so
the stack of the module that actually failed survives.

## BaseArtifactBooter: the template method

Every built-in booter extends `BaseArtifactBooter`, which implements the three phases once and leaves
three abstract holes:

```typescript
protected abstract getDefaultDirs(): string[];
protected abstract getDefaultExtensions(): string[];
protected abstract bind(): Promise<void>;
```

- **configure** resolves `artifactOptions` (`dirs`, `extensions`, `isNested` defaulting to `true`,
  `glob`), falling back to the subclass defaults. There is deliberately no trailing
  `...this.artifactOptions` spread: a key that *exists* but holds `undefined` (the shape
  `dirs: process.env.APP_DIRS?.split(',')` produces) would overwrite the default just computed, and
  `getPattern()` would throw "No directories specified".
- **discover** builds a glob and runs it with `cwd: root, absolute: true`.
- **load** dynamically `import()`s each discovered file, keeps every export for which `isClass()` is
  true, and hands them to the subclass's `bind()`.

An explicit `glob` short-circuits pattern building entirely. Otherwise the pattern is
`{dirs}/{**/*,*}.{exts}` when there are multiple dirs or extensions, or `dirs/{**/*,*}.ext` when
there is exactly one of each.

`isClass()` is the predicate that keeps this honest. It is not `typeof x === 'function' && x.prototype
!== undefined` - that is true of every non-arrow function, so a helper exported next to an artifact
would get bound and `new`-ed. It source-checks for `class`, sound because the toolchain targets ES2024.

## The built-in booters

| Booter | Default dir | Default extension | Binds to |
| --- | --- | --- | --- |
| `DatasourceBooter` | `datasources` | `.datasource.js` | `datasources.*` |
| `RepositoryBooter` | `repositories` | `.repository.js` | `repositories.*` |
| `ServiceBooter` | `services` | `.service.js` | `services.*` |
| `ControllerBooter` | `controllers` | `.controller.js` | `controllers.*` |

`bind()` is the same shape everywhere - one binding per loaded class, keyed by namespace and class
name, tagged with the namespace:

```typescript
const key = BindingKeys.build({ namespace: 'repositories', key: cls.name });
this.application.bind({ key }).toClass(cls).setTags('repositories');
```

That tag is what `registerDynamicBindings` in the application lifecycle later scans for. Each booter
injects `@app/project_root`, `@app/instance` and `@app/boot-options`, so per-artifact overrides come
from the application's `bootOptions` (`bootOptions.repositories`, and so on).

## `BootMixin` versus `BaseApplication`

`BootMixin` wraps any `Container` and binds the four booters plus the `Bootstrapper` in its
constructor. `BaseApplication.registerBooters()` does the equivalent for a full IGNIS application.
Either way, `boot()` resolves the singleton `Bootstrapper` and calls `boot({})`.

## The common failure

**A file that is not discovered is almost always the wrong directory or the wrong extension.** Note
the defaults end in `.js`, not `.ts` - discovery runs against compiled output. If a controller's
routes 404 and no binding exists for it, check: does the file live under `controllers/`, does its
name end in `.controller.js`, did the build emit it. Run with `DEBUG` set - `discover` logs the root,
the pattern, and every file it matched.

## Related

- [Application lifecycle](/architecture/application-lifecycle.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [boot package](/packages/boot.md)
- [Debugging](/process/debugging.md)
